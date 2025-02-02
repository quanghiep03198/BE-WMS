import { DATA_SOURCE_DATA_LAKE, DATA_SOURCE_ERP } from '@/databases/constants'
import { Inject, Injectable, InternalServerErrorException, NotFoundException, Scope } from '@nestjs/common'
import { REQUEST } from '@nestjs/core'
import { InjectDataSource } from '@nestjs/typeorm'
import { Request } from 'express'
import { chunk, groupBy, pick } from 'lodash'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { Brackets, DataSource, FindOptionsWhere, In } from 'typeorm'
import { TENANCY_DATASOURCE } from '../tenancy/constants'
import { FALLBACK_VALUE } from './constants'
import { ExchangeEpcDTO, SearchCustOrderParamsDTO, UpdateStockDTO } from './dto/rfid.dto'
import { FPInventoryEntity } from './entities/fp-inventory.entity'
import { RFIDMatchCustomerEntity } from './entities/rfid-customer-match.entity'
import { RFIDDataService } from './rfid.data.service'
import { DeleteEpcBySizeParams, RFIDSearchParams } from './types'

/**
 * @description Service for Finished Production Inventory (FPI)
 */
@Injectable({ scope: Scope.REQUEST })
export class RFIDService {
	constructor(
		@Inject(REQUEST) private readonly request: Request,
		@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly datasourceDL: DataSource,
		@InjectDataSource(DATA_SOURCE_ERP) private readonly datasourceERP: DataSource,
		@Inject(TENANCY_DATASOURCE) private readonly dataSource: DataSource | undefined,
		private readonly i18n: I18nService
	) {}

	public async fetchLatestData(args: RFIDSearchParams) {
		const [epcs, orders] = await Promise.all([this.getIncomingEpcs(args), this.getOrderDetails()])

		return { epcs, orders }
	}

	public async getIncomingEpcs(args: RFIDSearchParams) {
		const tenantId = this.request.headers['x-tenant-id']
		const epcs = await RFIDDataService.getScannedEpcs(String(tenantId))

		const totalDocs = epcs.length
		const totalPages = Math.ceil(totalDocs / args._limit)

		return {
			data: epcs
				.slice((args._page - 1) * args._limit, args._page * args._limit)
				.filter((item) => (!args['mo_no.eq'] ? true : item.mo_no === args['mo_no.eq'])),
			totalDocs: totalDocs,
			totalPages: totalPages,
			limit: args._limit,
			page: args._page,
			hasNextPage: args._page < totalPages,
			hasPrevPage: args._page > 1
		}
	}

	public async getOrderDetails() {
		const tenantId = this.request.headers['x-tenant-id']
		const accumulatedData = await RFIDDataService.getScannedEpcs(String(tenantId))
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

	public async updateFPStock(orderCode: string, data: UpdateStockDTO) {
		const tenantId = this.request.headers['x-tenant-id']
		const payload = await RFIDDataService.getScannedEpcsByOrder(String(tenantId), orderCode)
		const queryRunner = this.dataSource.createQueryRunner()
		queryRunner.startTransaction()
		try {
			for (const item of chunk(
				payload.map((value) => ({ ...value, ...data })),
				100
			)) {
				await this.dataSource.getRepository(FPInventoryEntity).insert(item)
			}
			queryRunner.commitTransaction()
			RFIDDataService.deleteScannedEpcsByOrder(String(tenantId), orderCode)
		} catch {
			queryRunner.rollbackTransaction()
		}
	}

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
			await RFIDDataService.updateScannedEpcs(tenantId, epcToExchange, { mo_no: payload.mo_no_actual })
		} catch (e) {
			await queryRunner.rollbackTransaction()
			throw new InternalServerErrorException(e.message)
		} finally {
			await queryRunner.release()
		}
	}

	public async deleteEpcBySize(tenantId: string, filters: DeleteEpcBySizeParams) {
		return await RFIDDataService.deleteScannedEpcsBySize(tenantId, filters)
	}
}
