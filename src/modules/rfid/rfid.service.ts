import { DATA_SOURCE_DATA_LAKE, DATA_SOURCE_ERP } from '@/databases/constants'
import { Inject, Injectable, InternalServerErrorException, Logger, NotFoundException, Scope } from '@nestjs/common'
import { REQUEST } from '@nestjs/core'
import { InjectDataSource } from '@nestjs/typeorm'
import { Request } from 'express'
import fs from 'fs-extra'
import { chunk, groupBy, omit, pick } from 'lodash'
import { I18nContext, I18nService } from 'nestjs-i18n'
import path from 'node:path'
import { Brackets, DataSource, FindOptionsWhere, In } from 'typeorm'
import { TenancyService } from '../tenancy/tenancy.service'
import { EXCLUDED_ORDERS, FALLBACK_VALUE, INTERNAL_EPC_PATTERN } from './constants'
import { ExchangeEpcDTO, SearchCustOrderParamsDTO, UpdateStockDTO } from './dto/rfid.dto'
import { FPInventoryEntity } from './entities/fp-inventory.entity'
import { RFIDMatchCustomerEntity } from './entities/rfid-customer-match.entity'
import { RFIDDataService } from './rfid.data.service'
import { FPIRespository } from './rfid.repository'
import { DeleteEpcBySizeParams, RFIDSearchParams } from './types'

/**
 * @description Service for Finished Production Inventory (FPI)
 */
@Injectable({ scope: Scope.REQUEST })
export class RFIDService {
	constructor(
		@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly datasourceDL: DataSource,
		@InjectDataSource(DATA_SOURCE_ERP) private readonly datasourceERP: DataSource,
		@Inject(REQUEST) private readonly request: Request,
		private readonly i18n: I18nService,
		private readonly rfidRepository: FPIRespository,
		private readonly tenancyService: TenancyService
	) {}

	public async fetchLatestData(args: RFIDSearchParams) {
		const epcs = this.getIncomingEpcs(args)
		const orders = await this.getOrderDetails()
		return { epcs, orders }
	}

	public getIncomingEpcs(args: RFIDSearchParams) {
		const tenantId = this.request.headers['x-tenant-id']
		const epcs = RFIDDataService.getScannedEpcs(String(tenantId))
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
		const accumulatedData = RFIDDataService.getScannedEpcs(String(tenantId))

		if (!Array.isArray(accumulatedData)) throw new Error('Invalid data format')

		Logger.debug(accumulatedData.map((item) => item.epc).join(','))
		const result = await this.tenancyService.dataSource.query(
			fs.readFileSync(path.join(__dirname, './sql/order-detail.sql'), { encoding: 'utf-8' }).toString(),
			[accumulatedData.map((item) => item.epc).join(','), EXCLUDED_ORDERS.join(',')]
		)

		return Object.entries(groupBy(result, 'mo_no')).map(([order, sizes]) => ({
			mo_no: order,
			mat_code: sizes[0].mat_code,
			shoes_style_code_factory: sizes[0].shoes_style_code_factory,
			sizes: sizes.map((size) => ({
				size_numcode: size.size_numcode,
				count: size.count
			}))
		}))
	}

	public async updateFPStock(orderCode: string, data: UpdateStockDTO) {
		const tenantId = this.request.headers['x-tenant-id']
		const payload = RFIDDataService.getScannedEpcsByOrder(String(tenantId), orderCode)
		await this.tenancyService.dataSource
			.getRepository(FPInventoryEntity)
			.insert(payload.map((value) => ({ ...value, ...data })))

		RFIDDataService.deleteScannedEpcsByOrder(String(tenantId), orderCode)
	}

	public deleteUnexpectedOrder(orderCode: string) {
		if (orderCode === FALLBACK_VALUE) return // * Only delete defined manufacturing order
		const tenantId = this.request.headers['x-tenant-id']
		return RFIDDataService.deleteScannedEpcsByOrder(String(tenantId), orderCode)
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
		const queryRunner = this.tenancyService.dataSource.createQueryRunner()
		const epcToExchange = payload.multi
			? await this.rfidRepository.getAllExchangableEpc(payload)
			: await this.rfidRepository.getExchangableEpcBySize(payload)

		if (epcToExchange.length === 0) {
			throw new NotFoundException(this.i18n.t('rfid.errors.no_matching_epc', { lang: I18nContext.current().lang }))
		}

		const update = pick(payload, 'mo_no_actual')

		const BATCH_SIZE = 2000

		const epcBatches = chunk(
			epcToExchange.map((item) => item.epc),
			BATCH_SIZE
		)

		await queryRunner.startTransaction('READ UNCOMMITTED')

		try {
			if (payload.mo_no === FALLBACK_VALUE) {
				const unknownCustomerEpc = await queryRunner.manager
					.getRepository(RFIDMatchCustomerEntity)
					.createQueryBuilder('cust')
					.select(/* SQL */ `TOP ${payload.quantity} cust.*`)
					.innerJoin(FPInventoryEntity, 'inv', /* SQL */ `cust.epc = inv.epc`)
					.where(
						new Brackets((qb) => {
							return qb.where(/* SQL */ `cust.mo_no IS NULL OR inv.mo_no IS NULL`)
						})
					)
					.andWhere(/* SQL */ `inv.rfid_status IS NULL`)
					.andWhere(/* SQL */ `inv.epc NOT LIKE :internalEpcPattern`, { internalEpcPattern: INTERNAL_EPC_PATTERN })
					.getRawMany()

				await queryRunner.manager
					.getRepository(RFIDMatchCustomerEntity)
					.insert(unknownCustomerEpc.map((item) => omit({ ...item, mo_no: payload.mo_no_actual }, 'keyid')))

				for (const epcBatch of epcBatches) {
					const criteria: FindOptionsWhere<RFIDMatchCustomerEntity | FPInventoryEntity> = {
						epc: In(epcBatch)
					}
					await queryRunner.manager.update(FPInventoryEntity, criteria, update)
				}
			} else {
				for (const epcBatch of epcBatches) {
					const criteria: FindOptionsWhere<RFIDMatchCustomerEntity | FPInventoryEntity> = {
						epc: In(epcBatch)
					}
					await queryRunner.manager.update(RFIDMatchCustomerEntity, criteria, update)
					await queryRunner.manager.update(FPInventoryEntity, criteria, update)
				}
			}
			await queryRunner.commitTransaction()
		} catch (e) {
			await queryRunner.rollbackTransaction()
			throw new InternalServerErrorException(e.message)
		} finally {
			await queryRunner.release()
		}
	}

	public async deleteEpcBySize(filters: DeleteEpcBySizeParams) {
		// TODO: Implement delete from stored JSON data file
	}
}
