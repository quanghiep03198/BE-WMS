import { DATA_SOURCE_DATA_LAKE, DATA_SOURCE_ERP } from '@/databases/constants'
import { InjectQueue } from '@nestjs/bullmq'
import { Inject, Injectable, InternalServerErrorException, NotFoundException, Scope } from '@nestjs/common'
import { REQUEST } from '@nestjs/core'
import { InjectModel } from '@nestjs/mongoose'
import { InjectDataSource } from '@nestjs/typeorm'
import { Queue } from 'bullmq'
import { Request } from 'express'
import { chunk, groupBy, pick } from 'lodash'
import { DeleteResult, PaginateModel, RootFilterQuery } from 'mongoose'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { Brackets, DataSource, FindOptionsWhere, In } from 'typeorm'
import { TENANCY_DATASOURCE, Tenant } from '../tenancy/constants'
import { FALLBACK_VALUE, POST_DATA_QUEUE_GL1, POST_DATA_QUEUE_GL3, POST_DATA_QUEUE_GL4 } from './constants'
import { ExchangeEpcDTO, PostReaderDataDTO, SearchCustOrderParamsDTO, UpsertStockDTO } from './dto/rfid.dto'
import { RFIDMatchCustomerEntity } from './entities/rfid-customer-match.entity'
import { RFIDDataService } from './rfid.data.service'
import { Epc, EpcDocument } from './schemas/epc.schema'
import { DeleteEpcBySizeParams, RFIDSearchParams } from './types'

/**
 * @description Service for Finished Production Inventory (FPI)
 */
@Injectable({ scope: Scope.REQUEST })
export class RFIDService {
	constructor(
		@Inject(REQUEST) private readonly request: Request,
		@Inject(TENANCY_DATASOURCE) private readonly dataSource: DataSource | undefined,
		@InjectModel(Epc.name) private readonly epcModel: PaginateModel<EpcDocument>,
		@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly datasourceDL: DataSource,
		@InjectDataSource(DATA_SOURCE_ERP) private readonly datasourceERP: DataSource,
		@InjectQueue(POST_DATA_QUEUE_GL1) private readonly postDataQueueGL1: Queue,
		@InjectQueue(POST_DATA_QUEUE_GL3) private readonly postDataQueueGL3: Queue,
		@InjectQueue(POST_DATA_QUEUE_GL4) private readonly postDataQueueGL4: Queue,
		private readonly i18n: I18nService
	) {}

	public async addPostDataQueueJob(tenant: string, data: PostReaderDataDTO) {
		const queue = this.getQueueByTenant(tenant)
		if (!queue)
			throw new NotFoundException(this.i18n.t('rfid.errors.invalid_tenant', { lang: I18nContext.current().lang }))
		return await queue.add(tenant, data, { lifo: true })
	}

	private getQueueByTenant(tenant: string): Queue | null {
		switch (tenant) {
			case Tenant.VN_LIANYING_PRIMARY:
				return this.postDataQueueGL1
			case Tenant.VN_LIANSHUN_PRIMARY:
				return this.postDataQueueGL3
			case Tenant.KM_PRIMARY:
				return this.postDataQueueGL4
			default:
				return null
		}
	}

	public async fetchLatestData(args: RFIDSearchParams) {
		const [epcs, orders] = await Promise.all([this.getIncomingEpcs(args), this.getOrderDetails()])
		return { epcs, orders }
	}

	public async getIncomingEpcs(args: RFIDSearchParams) {
		const tenantId = this.request.headers['x-tenant-id']
		return await this.epcModel.paginate(
			{
				tenant_id: tenantId
			},
			{
				sort: { record_time: -1 },
				page: args._page,
				limit: args._limit,
				customLabels: {
					docs: 'data'
				}
			}
		)
	}

	public async getOrderDetails() {
		const tenantId = this.request.headers['x-tenant-id']
		const accumulatedData = await this.epcModel.find({ tenant_id: String(tenantId) })
		// const accumulatedData = await RFIDDataService.getScannedEpcs(String(tenantId))
		if (!Array.isArray(accumulatedData)) throw new Error('Invalid data format')
		return Object.entries(
			groupBy(accumulatedData, (item) => {
				return [item.mo_no, item.mat_code, item.shoes_style_code_factory]
			})
		).map(([keys, sizes]) => {
			const [mo_no, mat_code, shoes_style_code_factory] = keys.split(',')
			return {
				mo_no,
				mat_code,
				shoes_style_code_factory,
				sizes: Object.entries(groupBy(sizes, 'size_numcode')).map(([size, items]) => ({
					size_numcode: size,
					count: items.length
				}))
			}
		})
	}

	public async upsertFPStock(orderCode: string, data: UpsertStockDTO) {
		const tenantId = this.request.headers['x-tenant-id']
		const payload = await RFIDDataService.getScannedEpcsByOrder(String(tenantId), orderCode)
		const queryRunner = this.dataSource.createQueryRunner()
		queryRunner.startTransaction()
		try {
			for (const item of chunk(
				payload.map((value) => ({ ...value, ...data })),
				100
			)) {
				const mergeSourceValues = item
					.map((value) => {
						return `(
							'${value.epc}', '${value.mo_no}', '${value.rfid_status}', '${value.rfid_use}', '${value.record_time}', '${value.station_no}',
							'${value.quantity}', '${value.storage}', '${value.factory_code}', '${value.dept_code}', '${value.dept_name}'
						)`
					})
					.join(',')

				await this.dataSource.query(/* SQL */ `
					MERGE INTO DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet AS target
					USING (
						VALUES ${mergeSourceValues}
					)  AS source (
							EPC_Code, mo_no, rfid_status, rfid_use, record_time, station_no,
							quantity, storage, FC_server_code, dept_code, dept_name
						)
					ON target.EPC_Code = source.EPC_Code
					WHEN NOT MATCHED THEN
						INSERT (
							EPC_Code, mo_no, rfid_status, rfid_use, record_time, station_no,
							quantity, storage, FC_server_code, dept_code, dept_name
						)
						VALUES (
							source.EPC_Code, source.mo_no, source.rfid_status, source.rfid_use, source.record_time, source.station_no,
							source.quantity, source.storage, source.FC_server_code, source.dept_code, source.dept_name
						)
					`)
			}
			queryRunner.commitTransaction()
			await this.epcModel.deleteMany({ tenant_id: String(tenantId), mo_no: orderCode })
			const queue = this.getQueueByTenant(tenantId.toString())
			await queue.drain()
		} catch {
			queryRunner.rollbackTransaction()
		}
	}

	/**
	 * @deprecated
	 */
	public async deleteUnexpectedOrder(orderCode: string) {
		if (orderCode === FALLBACK_VALUE) return // * Only delete defined manufacturing order
		const tenantId = this.request.headers['x-tenant-id']
		return await RFIDDataService.deleteScannedEpcsByOrder(String(tenantId), orderCode)
	}

	public async searchCustomerOrder(params: SearchCustOrderParamsDTO) {
		const subQuery = this.datasourceERP
			.createQueryBuilder()
			.select('manu.mo_no', 'mo_no')
			.from(/* SQL */ `wuerp_vnrd.dbo.ta_manufacturmst`, 'manu')
			.where(/* SQL */ `manu.cofactory_code = :factory_code`)
			.andWhere(/* SQL */ `manu.created >= CAST(DATEADD(YEAR, -2, GETDATE()) AS DATE)`)
			.setParameter('factory_code', params['factory_code.eq'])

		return await this.datasourceDL
			.createQueryBuilder()
			.select(/* SQL */ `DISTINCT TOP 5 mo_no AS mo_no`)
			.from(RFIDMatchCustomerEntity, 'cust')
			.where(/* SQL */ `mo_no IN (${subQuery.getQuery()})`)
			.andWhere(/* SQL */ `mo_no LIKE :searchTerm`, { searchTerm: `%${params.q}%` })
			.andWhere(
				new Brackets((qb) => {
					if (params['mat_code.eq'] === FALLBACK_VALUE) return qb
					return qb.andWhere(/* SQL */ `mat_code = :mat_code`, { mat_code: params['mat_code.eq'] }).andWhere(
						new Brackets((qb) => {
							if (!params['size_num_code.eq']) return qb
							return qb.andWhere(/* SQL */ `size_numcode = :size_numcode`, {
								size_numcode: params['size_num_code.eq']
							})
						})
					)
				})
			)
			.setParameters(subQuery.getParameters())
			.getRawMany()
	}

	// TODO: Implement update from stored JSON data file and dv_rfidmatchmst_cust table
	public async exchangeEpc(payload: ExchangeEpcDTO) {
		const tenantId = String(this.request.headers['x-tenant-id'])
		const queryRunner = this.dataSource.createQueryRunner()
		const scannedEpcs = await RFIDDataService.getScannedEpcs(tenantId)
		let epcToExchange = scannedEpcs
			.filter((item) => {
				if (payload.multi) {
					return (
						payload.mo_no
							.split(',')
							.map((m) => m.trim())
							.some((__item) => __item === item.mo_no) && item.mo_no !== payload.mo_no_actual
					)
				} else {
					return (
						item.mo_no === payload.mo_no &&
						item.size_numcode === payload.size_numcode &&
						item.mat_code === payload.mat_code
					)
				}
			})
			.map((item) => item.epc)

		if (!payload.multi && payload.quantity) {
			epcToExchange = epcToExchange.slice(0, payload.quantity)
		}

		if (epcToExchange.length === 0) {
			throw new NotFoundException(this.i18n.t('rfid.errors.no_matching_epc', { lang: I18nContext.current().lang }))
		}

		try {
			const update = pick(payload, 'mo_no_actual')
			await queryRunner.startTransaction('READ UNCOMMITTED')
			for (const epcBatch of chunk(epcToExchange, 2000)) {
				const criteria: FindOptionsWhere<RFIDMatchCustomerEntity> = {
					epc: In(epcBatch)
				}
				await queryRunner.manager.update(RFIDMatchCustomerEntity, criteria, update)
			}
			await queryRunner.commitTransaction()
			await this.epcModel.updateMany(
				{
					tenant_id: tenantId,
					epc: {
						$in: epcToExchange
					}
				},
				{ mo_no: payload.mo_no_actual }
			)
		} catch (e) {
			await queryRunner.rollbackTransaction()
			throw new InternalServerErrorException(e.message)
		} finally {
			await queryRunner.release()
		}
	}

	public async deleteScannedEpcs(tenantId: string, filters: DeleteEpcBySizeParams): Promise<DeleteResult> {
		const filterQuery: RootFilterQuery<Epc> = !filters['size_num_code.eq'] ? pick(filters, 'mo_no.eq') : filters
		if (filterQuery['size_numcode.eq'] && filterQuery['quantity.eq']) {
			const epcsToDelete = await this.epcModel
				.find({ tenant_id: tenantId, mo_no: filters['mo_no.eq'], size_numcode: filterQuery['size_numcode.eq'] })
				.limit(filters['quantity.eq'])
			return await this.epcModel.deleteMany({ epc: { $in: epcsToDelete.map((item) => item.epc) } })
		}
		return await this.epcModel.deleteMany({ tenant_id: tenantId, mo_no: filters['mo_no.eq'] })
	}
}
