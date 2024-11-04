import { FileLogger } from '@/common/helpers/file-logger.helper'
import { DATABASE_DATA_LAKE, DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
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
import { join } from 'node:path'
import { Brackets, DataSource, FindOptionsWhere, In, IsNull } from 'typeorm'
import { SqlServerConnectionOptions } from 'typeorm/driver/sqlserver/SqlServerConnectionOptions'
import { FactoryCodeOrderRef } from '../../department/constants'
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
import { ExchangeEpcDTO, UpdateStockDTO } from '../dto/rfid.dto'
import { FPInventoryEntity } from '../entities/fp-inventory.entity'
import { RFIDCustomerEntity } from '../entities/rfid-customer.entity'
import { FPInventoryRepository } from '../repositories/fp-inventory.repository'
import { RFIDSearchParams } from '../rfid.interface'

/**
 * @description Service for Finished Production Inventory (FPI)
 */
@Injectable({ scope: Scope.REQUEST })
export class FPIService {
	constructor(
		@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly datasource: DataSource,
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
		@Inject(REQUEST) private readonly request: Request,
		private readonly rfidRepository: FPInventoryRepository,
		private readonly eventEmitter: EventEmitter2,
		private readonly tenancyService: TenancyService,
		private readonly configService: ConfigService,
		private readonly i18n: I18nService
	) {}

	public async fetchItems({ page, filter }: RFIDSearchParams) {
		try {
			const [epcs, orders, sizes, has_invalid_epc] = await Promise.all([
				this.findWhereNotInStock({ page, filter }),
				this.rfidRepository.getOrderQuantity(),
				this.rfidRepository.getOrderSizes(),
				this.rfidRepository.checkInvalidEpcExist()
			])
			return { epcs, orders, sizes, has_invalid_epc }
		} catch (error) {
			throw new InternalServerErrorException(error)
		}
	}

	public async findWhereNotInStock({ page, filter }: RFIDSearchParams) {
		const LIMIT_FETCH_DOCS = 50

		const queryBuilder = this.tenancyService.dataSource
			.getRepository(FPInventoryEntity)
			.createQueryBuilder('inv')
			.select(/* SQL */ `inv.epc`, 'epc')
			.addSelect(/* SQL */ `COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue)`, 'mo_no')
			.where(/* SQL */ `inv.rfid_status IS NULL`)
			.andWhere(/* SQL */ `inv.epc NOT LIKE :excludedEpcPattern`)
			.andWhere(/* SQL */ `COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue) NOT IN (:...excludedOrders)`)
			.andWhere(
				new Brackets((qb) => {
					if (!filter) return qb
					return qb.andWhere(/* SQL */ `COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue) = :orderCode`, {
						orderCode: filter
					})
				})
			)
			.maxExecutionTime(1000)
			.setParameters({
				fallbackValue: FALLBACK_VALUE,
				excludedOrders: EXCLUDED_ORDERS,
				excludedEpcPattern: EXCLUDED_EPC_PATTERN
			})

		const [data, totalDocs] = await Promise.all([
			queryBuilder
				.orderBy(/* SQL */ `inv.record_time`, 'DESC')
				.addOrderBy(/* SQL */ `inv.epc`, 'ASC')
				.take(LIMIT_FETCH_DOCS)
				.skip((page - 1) * LIMIT_FETCH_DOCS)
				.getRawMany(),
			queryBuilder.getCount()
		])

		const totalPages = Math.ceil(totalDocs / LIMIT_FETCH_DOCS)

		return {
			data,
			hasNextPage: page < totalPages,
			hasPrevPage: page > 1,
			totalDocs,
			limit: LIMIT_FETCH_DOCS,
			page,
			totalPages
		}
	}

	public async getManufacturingOrderDetail() {
		const [sizes, orders] = await Promise.all([
			this.rfidRepository.getOrderSizes(),
			this.rfidRepository.getOrderQuantity()
		])
		return { sizes, orders }
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

	public async searchCustomerOrder(factoryCode: string, searchTerm: string) {
		/** @description Start year of Republic of China (Taiwan) */
		const ROC_ESTABLISHMENT_YEAR: number = 1911 // * Start year of Republic of China (Taiwan)

		/** @description Current year of Republic of China */
		const currentRepublicOfChinaYear: number = new Date().getFullYear() - ROC_ESTABLISHMENT_YEAR

		/** @description Prefix of manufacturing order code*/
		const orderCodePrefix: string = currentRepublicOfChinaYear.toString().slice(1) + FactoryCodeOrderRef[factoryCode]

		return await this.datasource.query(
			/* SQL */ `
					WITH datalist as (
						SELECT mo_no
						FROM DV_DATA_LAKE.dbo.dv_RFIDrecordmst_cust
						UNION ALL SELECT mo_no
						FROM DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust
					) SELECT DISTINCT TOP 5 * FROM datalist 
					WHERE mo_no LIKE CONCAT('%', @0, '%')
					AND mo_no LIKE CONCAT(@1, '%')`,
			[searchTerm, orderCodePrefix]
		)
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
			.leftJoin(
				RFIDCustomerEntity,
				'cust',
				/* SQL */ `cust.epc = inv.epc AND COALESCE(cust.mo_no, :fallbackValue) = COALESCE(inv.mo_no, :fallbackValue)`
			)
			.where(/* SQL */ `cust.mo_no IS NULL OR inv.mo_no IS NULL`)
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
		await this.cacheManager.set(`sync_process:${factoryCode}`, true, 60 * 1000 * 60)

		this.eventEmitter.emit(ThirdPartyApiEvent.DISPATCH, {
			params: { tenantId, factoryCode },
			data: distinctEpc
		} satisfies FetchThirdPartyApiEvent)
	}

	@OnEvent(ThirdPartyApiEvent.SUCCESS)
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
		/**
		 * @todo
		 * With each command number that is fetched from third party API, we will have a unique manufacturing order number (mo_no)
		 * Update the customer data with the manufacturing order number (mo_no) and size number (size_numcode)
		 */
		const queryRunner = dataSource.createQueryRunner()
		await queryRunner.connect()
		await queryRunner.startTransaction()

		try {
			for (const item of e.data) {
				const orderInformationQuery = readFileSync(
					join(__dirname, '../sql/order-information.sql'),
					'utf-8'
				).toString()
				const [orderInformation, epcToUpsert] = await Promise.all([
					this.datasource.query<Partial<RFIDCustomerEntity>[]>(orderInformationQuery, [item.mo_no]),
					queryRunner.manager
						.getRepository(FPInventoryEntity)
						.createQueryBuilder('inv')
						.select(/* SQL */ `inv.epc`)
						.where(/* SQL */ `inv.mo_no IS NULL`)
						.andWhere(/* SQL */ `inv.rfid_status IS NULL`)
						.andWhere(/* SQL */ `inv.epc = :epc`, { epc: item.epc })
						.getRawOne<Record<'epc', string>>()
				])

				const upsertRFIDCustQueryBuilder = !!epcToUpsert
					? queryRunner.manager
							.getRepository(RFIDCustomerEntity)
							.createQueryBuilder('cust')
							.update()
							.set({
								...orderInformation[0],
								...omit(item, 'epc')
							})
							.where(/* SQL */ `cust.epc = :epc`, { epc: epcToUpsert.epc })
					: queryRunner.manager
							.createQueryBuilder()
							.insert()
							.into(RFIDCustomerEntity)
							.values({
								...orderInformation[0],
								...item
							})

				const updateRFIDInvQueryBuilder = queryRunner.manager
					.getRepository(FPInventoryEntity)
					.createQueryBuilder('inv')
					.update()
					.set({ mo_no: item.mo_no })
					.where(/* SQL */ `inv.epc = :epc`, { epc: item.epc })
					.andWhere(/* SQL */ `inv.mo_no IS NULL`)
					.andWhere(/* SQL */ `inv.rfid_status IS NULL`)

				await Promise.all([upsertRFIDCustQueryBuilder.execute(), updateRFIDInvQueryBuilder.execute()])
			}
			await queryRunner.commitTransaction()
		} catch (error) {
			FileLogger.error(error.message)
			await queryRunner.rollbackTransaction()
			throw new InternalServerErrorException(error)
		} finally {
			// * Clear cache sync flag after synchronized with customer data
			await this.cacheManager.del(`sync_process:${e.params.factoryCode}`)
			await queryRunner.release()
		}
	}
}
