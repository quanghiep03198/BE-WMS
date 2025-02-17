import { InjectQueue } from '@nestjs/bullmq'
import { Inject, Injectable, InternalServerErrorException, NotFoundException, Scope } from '@nestjs/common'
import { REQUEST } from '@nestjs/core'
import { InjectModel } from '@nestjs/mongoose'
import { Queue } from 'bullmq'
import { format } from 'date-fns'
import { Request } from 'express'
import { chunk, groupBy, pick } from 'lodash'
import { DeleteResult, FilterQuery, PaginateModel, PipelineStage, RootFilterQuery } from 'mongoose'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { Brackets, DataSource, FindOptionsWhere, In } from 'typeorm'
import { TENANCY_DATASOURCE, Tenant } from '../tenancy/constants'
import { FALLBACK_VALUE, POST_DATA_QUEUE_GL1, POST_DATA_QUEUE_GL3, POST_DATA_QUEUE_GL4 } from './constants'

import { ExchangeEpcDTO, PostReaderDataDTO, SearchCustOrderParamsDTO, UpsertStockDTO } from './dto/rfid.dto'
import { RFIDMatchCustomerEntity } from './entities/rfid-customer-match.entity'
import { Epc, EpcDocument } from './schemas/epc.schema'
import { DeleteEpcBySizeParams, RFIDSearchParams, StoredRFIDReaderItem } from './types'

/**
 * @description Service for Finished Production Inventory (FPI)
 */
@Injectable({ scope: Scope.REQUEST })
export class RFIDService {
	constructor(
		@Inject(REQUEST) private readonly request: Request,
		@Inject(TENANCY_DATASOURCE) private readonly dataSource: DataSource | undefined,
		@InjectModel(Epc.name) private readonly epcModel: PaginateModel<EpcDocument>,
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

	/**
	 * @description Get the queue by request's tenant ID
	 */
	public getQueueByTenant(tenant: string): Queue | null {
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

	/**
	 * @description Cleanup the queue by tenant. All existing jobs around 5 minutes old will be removed
	 */
	public async cleanupQueue(tenantId): Promise<unknown[]> {
		const queue = this.getQueueByTenant(tenantId)
		if (!queue) return
		const GRACE_TIME = 60 * 1000 * 5
		const QUANTITY = 1000
		return await Promise.all([
			queue.drain(),
			queue.clean(GRACE_TIME, QUANTITY, 'active'),
			queue.clean(GRACE_TIME, QUANTITY, 'paused'),
			queue.clean(GRACE_TIME, QUANTITY, 'failed'),
			queue.clean(GRACE_TIME, QUANTITY, 'completed')
		])
	}

	public async fetchLatestData(args: RFIDSearchParams) {
		const [epcs, orders] = await Promise.all([this.getIncomingEpcs(args), this.getOrderDetails()])
		return { epcs, orders }
	}

	public async getIncomingEpcs(args: RFIDSearchParams) {
		const tenantId = this.request.headers['x-tenant-id']
		const filterQuery: FilterQuery<EpcDocument> = { tenant_id: tenantId, mo_no: args['mo_no.eq'] }
		if (!args['mo_no.eq']) delete filterQuery.mo_no

		return await this.epcModel.paginate(filterQuery, {
			sort: { record_time: -1, epc: 1, mo_no: 1 },
			lean: true,
			page: args._page,
			limit: args._limit,
			customLabels: {
				docs: 'data'
			}
		})
	}

	public async getOrderDetails() {
		const tenantId = this.request.headers['x-tenant-id']
		const accumulatedData = await this.epcModel.find({ tenant_id: String(tenantId) }).lean(true)
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

	public async captureDataChange(onSnapshot: (change?: any) => unknown): Promise<void> {
		this.epcModel
			.watch(
				[
					{
						$match: {
							operationType: {
								$in: ['insert', 'update', 'delete']
							}
						}
					}
				],
				{
					fullDocument: 'updateLookup'
				}
			)
			.on('change', onSnapshot)
	}

	public async upsertFPStock(orderCode: string, data: UpsertStockDTO) {
		const tenantId = this.request.headers['x-tenant-id']
		const payload = await this.epcModel.find({ tenant_id: String(tenantId), mo_no: orderCode }).lean(true)

		const queryRunner = this.dataSource.createQueryRunner()
		const session = await this.epcModel.startSession()
		await Promise.all([queryRunner.startTransaction(), session.startTransaction()])
		try {
			for (const item of chunk(
				payload.map((value) => ({
					...value,
					...data,
					record_time: format(value.record_time, 'yyyy-MM-dd HH:mm:ss')
				})),
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
							EPC_Code, mo_no, rfid_status, rfid_use, record_time, stationNO,
							quantity, storage, FC_server_code, dept_code, dept_name
						)
						ON target.EPC_Code = source.EPC_Code
						WHEN NOT MATCHED THEN
						INSERT (
							EPC_Code, mo_no, rfid_status, rfid_use, record_time, stationNO,
							quantity, storage, FC_server_code, dept_code, dept_name
						)
						VALUES (
							source.EPC_Code, source.mo_no, source.rfid_status, source.rfid_use, CAST(source.record_time AS DATE), source.stationNO,
							source.quantity, source.storage, source.FC_server_code, source.dept_code, source.dept_name
						);
					`)
			}
			await this.epcModel.deleteMany({ tenant_id: data.readable_tenant, mo_no: orderCode })

			await Promise.all([queryRunner.commitTransaction(), session.commitTransaction()])
		} catch (e) {
			await Promise.all([queryRunner.rollbackTransaction(), session.abortTransaction()])
			throw new InternalServerErrorException(e)
		}
	}

	public async searchCustomerOrder(params: SearchCustOrderParamsDTO) {
		const subQuery = this.dataSource
			.createQueryBuilder()
			.select('manu.mo_no', 'mo_no')
			.from(/* SQL */ `wuerp_vnrd.dbo.ta_manufacturmst`, 'manu')
			.where(/* SQL */ `manu.cofactory_code = :factory_code`)
			.andWhere(/* SQL */ `manu.created >= CAST(DATEADD(YEAR, -2, GETDATE()) AS DATE)`)
			.setParameter('factory_code', params['factory_code.eq'])

		return await this.dataSource
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
		const session = await this.epcModel.startSession()
		const filterQuery: FilterQuery<EpcDocument> = payload.multi
			? {
					tenant_id: tenantId,
					mo_no: { $in: payload.mo_no.split(',').map((m) => m.trim()), $ne: payload.mo_no_actual }
				}
			: {
					tenant_id: tenantId,
					mo_no: payload.mo_no,
					size_numcode: payload.size_numcode,
					mat_code: payload.mat_code
				}
		const extraPipelineStages: PipelineStage[] =
			payload.quantity && !payload.multi ? [{ $limit: payload.quantity }] : []

		const epcToExchange = await this.epcModel.aggregate<StoredRFIDReaderItem>([
			{ $match: filterQuery },
			{ $project: { epc: 1 } },
			...extraPipelineStages
		])

		if (epcToExchange.length === 0) {
			throw new NotFoundException(this.i18n.t('rfid.errors.no_matching_epc', { lang: I18nContext.current().lang }))
		}

		try {
			const update = pick(payload, 'mo_no_actual')
			await Promise.all([session.startTransaction(), queryRunner.startTransaction('READ UNCOMMITTED')])
			for (const epcBatch of chunk(
				epcToExchange.map((item) => item.epc),
				2000
			)) {
				const criteria: FindOptionsWhere<RFIDMatchCustomerEntity> = {
					epc: In(epcBatch)
				}
				await queryRunner.manager.update(RFIDMatchCustomerEntity, criteria, update)
			}
			await this.epcModel.updateMany(
				{
					tenant_id: tenantId,
					epc: { $in: epcToExchange.map((item) => item.epc) }
				},
				{ mo_no: payload.mo_no_actual },
				{ new: true }
			)
			await Promise.all([queryRunner.commitTransaction(), session.commitTransaction()])
		} catch (e) {
			await Promise.all([queryRunner.rollbackTransaction(), session.abortTransaction()])
			throw new InternalServerErrorException(e.message)
		} finally {
			await queryRunner.release()
		}
	}

	public async deleteScannedEpcs(tenantId: string, filters: DeleteEpcBySizeParams): Promise<DeleteResult> {
		const filterQuery: RootFilterQuery<Epc> = !filters['size_numcode.eq'] ? pick(filters, 'mo_no.eq') : filters
		if (filterQuery['size_numcode.eq'] && filterQuery['quantity.eq']) {
			const epcsToDelete = await this.epcModel
				.find({ tenant_id: tenantId, mo_no: filters['mo_no.eq'], size_numcode: filterQuery['size_numcode.eq'] })
				.limit(filters['quantity.eq'])
				.lean(true)

			return await this.epcModel.deleteMany({
				tenant_id: tenantId,
				epc: { $in: epcsToDelete.map((item) => item.epc) }
			})
		}
		return await this.epcModel.deleteMany({ tenant_id: tenantId, mo_no: filters['mo_no.eq'] })
	}
}
