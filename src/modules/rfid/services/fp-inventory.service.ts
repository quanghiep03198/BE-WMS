import { FileLogger } from '@/common/helpers/file-logger.helper'
import { DATABASE_DATA_LAKE, DATA_SOURCE_DATA_LAKE, DATA_SOURCE_ERP } from '@/databases/constants'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable, InternalServerErrorException, NotFoundException, Scope } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { REQUEST } from '@nestjs/core'
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter'
import { InjectDataSource } from '@nestjs/typeorm'
import { Cache } from 'cache-manager'
import { Request } from 'express'
import { chunk, omit, pick } from 'lodash'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Brackets, DataSource, FindOptionsWhere, In, IsNull } from 'typeorm'
import { SqlServerConnectionOptions } from 'typeorm/driver/sqlserver/SqlServerConnectionOptions'
import { TenancyService } from '../../tenancy/tenancy.service'
import { ThirdPartyApiEvent } from '../../third-party-api/constants'
import { FetchThirdPartyApiEvent, SyncEventPayload } from '../../third-party-api/third-party-api.interface'
import {
	EXCLUDED_EPC_PATTERN,
	EXCLUDED_ORDERS,
	FALLBACK_VALUE,
	INTERNAL_EPC_PATTERN,
	MATCH_EPC_CHAR_LEN
} from '../constants'
import { ExchangeEpcDTO, SearchCustOrderParamsDTO, UpdateStockDTO } from '../dto/fp-inventory.dto'
import { FPInventoryEntity } from '../entities/fp-inventory.entity'
import { RFIDCustomerEntity } from '../entities/rfid-customer.entity'
import { FPIRespository } from '../repositories/fp-inventory.repository'
import { RFIDSearchParams } from '../rfid.interface'

/**
 * @description Service for Finished Production Inventory (FPI)
 */
@Injectable({ scope: Scope.REQUEST })
export class FPInventoryService {
	constructor(
		@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly datasourceDL: DataSource,
		@InjectDataSource(DATA_SOURCE_ERP) private readonly datasourceERP: DataSource,
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
		@Inject(REQUEST) private readonly request: Request,
		private readonly rfidRepository: FPIRespository,
		private readonly eventEmitter: EventEmitter2,
		private readonly tenancyService: TenancyService,
		private readonly configService: ConfigService,
		private readonly i18n: I18nService
	) {}

	public async fetchItems(args: RFIDSearchParams) {
		try {
			const [epcs, orders, has_invalid_epc] = await Promise.all([
				this.findWhereNotInStock(args),
				this.rfidRepository.getOrderDetails(),
				this.rfidRepository.checkInvalidEpcExist()
			])
			return { epcs, orders, has_invalid_epc }
		} catch (error) {
			throw new InternalServerErrorException(error)
		}
	}

	public async findWhereNotInStock(args: RFIDSearchParams) {
		const LIMIT_FETCH_DOCS = 50

		const queryBuilder = this.tenancyService.dataSource
			.getRepository(FPInventoryEntity)
			.createQueryBuilder('inv')
			.select(/* SQL */ `inv.epc`, 'epc')
			.addSelect(/* SQL */ `COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue)`, 'mo_no')
			.where(/* SQL */ `inv.rfid_status IS NULL`)
			.andWhere(/* SQL */ `inv.record_time >= CAST(GETDATE() AS DATE)`)
			.andWhere(/* SQL */ `inv.EPC_Code NOT LIKE :excludedEpcPattern`)
			.andWhere(/* SQL */ `COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue) NOT IN (:...excludedOrders)`)
			.andWhere(
				new Brackets((qb) => {
					if (!args['mo_no.eq']) return qb
					return qb.andWhere(/* SQL */ `COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue) = :mo_no`, {
						mo_no: args['mo_no.eq']
					})
				})
			)
			.orderBy(/* SQL */ `inv.mo_no`, 'ASC')
			.addOrderBy(/* SQL */ `inv.epc`, 'ASC')
			.addOrderBy(/* SQL */ `inv.record_time`, 'DESC')
			.limit(LIMIT_FETCH_DOCS)
			.offset((args.page - 1) * LIMIT_FETCH_DOCS)
			.maxExecutionTime(1000)
			.setParameters({
				fallbackValue: FALLBACK_VALUE,
				excludedOrders: EXCLUDED_ORDERS,
				excludedEpcPattern: EXCLUDED_EPC_PATTERN
			})

		const [data, totalDocs] = await Promise.all([queryBuilder.getRawMany(), queryBuilder.getCount()])

		const totalPages = Math.ceil(totalDocs / LIMIT_FETCH_DOCS)

		return {
			data,
			hasNextPage: args.page < totalPages,
			hasPrevPage: args.page > 1,
			totalDocs,
			limit: LIMIT_FETCH_DOCS,
			page: args.page,
			totalPages
		}
	}

	public async getManufacturingOrderDetail() {
		return await this.rfidRepository.getOrderDetails()
	}

	public async updateStock(payload: UpdateStockDTO) {
		const repository = this.tenancyService.dataSource.getRepository(FPInventoryEntity)
		const updatePayload = omit(payload, 'mo_no')
		const queryBuilder = repository.createQueryBuilder().update().set(updatePayload)

		if (!payload.mo_no) {
			queryBuilder.where({ mo_no: IsNull() })
		} else {
			queryBuilder.where(/* SQL */ `COALESCE(mo_no_actual, mo_no, :fallbackValue) = :mo_no`, {
				mo_no: payload.mo_no,
				fallbackValue: FALLBACK_VALUE
			})
		}

		return await queryBuilder.execute()
	}

	public async deleteUnexpectedOrder(orderCode: string) {
		if (orderCode === FALLBACK_VALUE) return // * Only delete defined manufacturing order

		const queryRunner = this.tenancyService.dataSource.createQueryRunner()
		await queryRunner.startTransaction()
		try {
			await queryRunner.manager.query(
				/* SQL */ `
					DELETE FROM DV_DATA_LAKE.dbo.UHF_RFID_TEST WHERE epc IN (
						SELECT EPC_Code as epc FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet
						WHERE COALESCE(mo_no_actual, mo_no) = @0
					)`,
				[orderCode]
			)
			await queryRunner.manager
				.createQueryBuilder()
				.delete()
				.from(FPInventoryEntity)
				.where({ mo_no: orderCode })
				.orWhere({ mo_no_actual: orderCode })
				.execute()
			await queryRunner.commitTransaction()
		} catch (error) {
			await queryRunner.rollbackTransaction()
			throw new InternalServerErrorException(error)
		} finally {
			await queryRunner.release()
		}
	}

	public async searchCustomerOrder(params: SearchCustOrderParamsDTO) {
		const subQuery = this.datasourceERP
			.createQueryBuilder()
			.select('manu.mo_no', 'mo_no')
			.from(/* SQL */ `wuerp_vnrd.dbo.ta_manufacturmst`, 'manu')
			.where(/* SQL */ `manu.cofactory_code = :factory`)
			.andWhere(/* SQL */ `manu.created >= CAST(DATEADD(YEAR, -2, GETDATE()) AS DATE)`)
			.setParameter('factory_code', params['factory_code.eq'])

		return await this.datasourceDL
			.createQueryBuilder()
			.select(/* SQL */ `DISTINCT TOP 5 mo_no AS mo_no`)
			.from(RFIDCustomerEntity, 'cust')
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

		await queryRunner.startTransaction()
		try {
			if (payload.mo_no === FALLBACK_VALUE) {
				const unknownCustomerEpc = await queryRunner.manager
					.getRepository(RFIDCustomerEntity)
					.createQueryBuilder('cust')
					.select(/* SQL */ `TOP ${payload.quantity} cust.*`)
					.innerJoin(FPInventoryEntity, 'inv', /* SQL */ `cust.epc = inv.epc`)
					.where(
						new Brackets((qb) => {
							return qb.where(/* SQL */ `cust.mo_no IS NULL OR inv.mo_no IS NULL`)
						})
					)
					.andWhere(/* SQL */ `inv.epc NOT LIKE :internalEpcPattern`, {
						internalEpcPattern: INTERNAL_EPC_PATTERN
					})
					.andWhere(/* SQL */ `inv.rfid_status IS NULL`)
					.getRawMany()

				await queryRunner.manager
					.getRepository(RFIDCustomerEntity)
					.insert(unknownCustomerEpc.map((item) => omit({ ...item, mo_no: payload.mo_no_actual }, 'keyid')))

				for (const epcBatch of epcBatches) {
					const criteria: FindOptionsWhere<RFIDCustomerEntity | FPInventoryEntity> = {
						epc: In(epcBatch)
					}
					await queryRunner.manager.update(FPInventoryEntity, criteria, update)
				}
			} else {
				for (const epcBatch of epcBatches) {
					const criteria: FindOptionsWhere<RFIDCustomerEntity | FPInventoryEntity> = {
						epc: In(epcBatch)
					}
					await Promise.all([
						queryRunner.manager.update(RFIDCustomerEntity, criteria, update),
						queryRunner.manager.update(FPInventoryEntity, criteria, update)
					])
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

	public async syncDataWithThirdPartyApi() {
		const tenantId = String(this.request.headers['x-tenant-id'])
		const factoryCode = String(this.request.headers['x-user-company'])

		// * Prevent multiple sync process
		const syncProcessFlag = await this.cacheManager.get(`sync_process:${factoryCode}`)
		if (syncProcessFlag) return

		// * First 22 characters in EPC will have the same manufacturing order code (mo_no)
		const unknownCustomerEpc = await this.tenancyService.dataSource
			.getRepository(FPInventoryEntity)
			.createQueryBuilder('inv')
			.select(/* SQL */ `DISTINCT MIN(inv.epc) AS epc`)
			.where(/* SQL */ `inv.mo_no IS NULL`)
			.andWhere(/* SQL */ `inv.rfid_status IS NULL`)
			.groupBy(/* SQL */ `LEFT(inv.epc, :matchEpcCharLen)`)
			.setParameters({
				fallbackValue: FALLBACK_VALUE,
				matchEpcCharLen: MATCH_EPC_CHAR_LEN
			})
			.getRawMany()

		// * If exist customer's EPCs that do not have manufacturing order, emit event to synchronize
		if (unknownCustomerEpc.length === 0) return

		const distinctEpc = unknownCustomerEpc.map((item) => item.epc)
		// * Set cache flag to prevent multiple sync process
		await this.cacheManager.set(`sync_process:${factoryCode}`, true, 60 * 1000 * 5)

		this.eventEmitter.emit(ThirdPartyApiEvent.DISPATCH, {
			params: { tenantId, factoryCode },
			data: distinctEpc
		} satisfies FetchThirdPartyApiEvent)
	}

	@OnEvent(ThirdPartyApiEvent.FULFILL)
	protected async syncWithCustomerData(e: SyncEventPayload) {
		// * Intialize datasource
		const tenant = this.tenancyService.findOneById(e.params.tenantId)
		const dataSource = new DataSource({
			...this.configService.getOrThrow<SqlServerConnectionOptions>('database'),
			entities: [join(__dirname, '../entities/*.entity.{ts,js}')],
			host: tenant.host,
			database: DATABASE_DATA_LAKE
		})

		if (!dataSource.isInitialized) {
			await dataSource.initialize()
		}

		const storedDataFromApi = readFileSync(
			resolve(join(__dirname, `/src/assets/data/${e.data.storeDataFileName}`), 'utf-8')
		)

		/**
		 * TODO: Implement logic to upsert data from third party API that is stored in data assets
		 * Previous logic is deprecated
		 */
		FileLogger.debug(storedDataFromApi)
		return
	}
}
