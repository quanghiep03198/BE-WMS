import { FileLogger } from '@/common/helpers/file-logger.helper'
import { DATABASE_DATA_LAKE, DATA_SOURCE_DATA_LAKE, DATA_SOURCE_ERP } from '@/databases/constants'
import { Inject, Injectable, InternalServerErrorException, NotFoundException, Scope } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { REQUEST } from '@nestjs/core'
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter'
import { InjectDataSource } from '@nestjs/typeorm'
import { Request } from 'express'
import { chunk, omit, pick, uniqBy } from 'lodash'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Brackets, DataSource, FindOptionsWhere, In, IsNull, Like, Not } from 'typeorm'
import { SqlServerConnectionOptions } from 'typeorm/driver/sqlserver/SqlServerConnectionOptions'
import { TenancyService } from '../tenancy/tenancy.service'
import { ThirdPartyApiEvent } from '../third-party-api/constants'
import {
	FetchThirdPartyApiEvent,
	SyncEventPayload,
	ThirdPartyApiResponseData
} from '../third-party-api/interfaces/third-party-api.interface'
import { ThirdPartyApiHelper } from '../third-party-api/third-party-api.helper'
import {
	EXCLUDED_EPC_PATTERN,
	EXCLUDED_ORDERS,
	FALLBACK_VALUE,
	INTERNAL_EPC_PATTERN,
	MATCH_EPC_CHAR_LEN
} from './constants'
import { ExchangeEpcDTO, SearchCustOrderParamsDTO, UpdateStockDTO } from './dto/rfid.dto'
import { FPInventoryEntity } from './entities/fp-inventory.entity'
import { RFIDMatchCustomerEntity } from './entities/rfid-customer-match.entity'
import { FPIRespository } from './rfid.repository'
import { RFIDSearchParams, UpsertRFIDCustomerData } from './types'

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
		private readonly configService: ConfigService,
		private readonly eventEmitter: EventEmitter2,
		private readonly rfidRepository: FPIRespository,
		private readonly tenancyService: TenancyService,
		private readonly thirdPartyApiHelper: ThirdPartyApiHelper
	) {}

	public async fetchItems(args: RFIDSearchParams) {
		try {
			const [epcs, orders] = await Promise.all([
				this.findWhereNotInStock(args),
				this.rfidRepository.getOrderDetails()
			])

			return { epcs, orders }
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
			.orderBy(/* SQL */ `inv.epc`, 'DESC')
			.addOrderBy(/* SQL */ `inv.mo_no`, 'DESC')
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

	public async updateStock(orderCode: string, payload: UpdateStockDTO) {
		const repository = this.tenancyService.dataSource.getRepository(FPInventoryEntity)
		const queryBuilder = repository.createQueryBuilder().update().set(payload)

		if (orderCode === FALLBACK_VALUE) {
			queryBuilder.where(/* SQL */ `mo_no IS NULL`)
		} else {
			queryBuilder.where(/* SQL */ `COALESCE(mo_no_actual, mo_no, :fallbackValue) = :mo_no`, {
				mo_no: orderCode,
				fallbackValue: FALLBACK_VALUE
			})
		}

		return await queryBuilder.execute()
	}

	public async deleteUnexpectedOrder(orderCode: string) {
		if (orderCode === FALLBACK_VALUE) return // * Only delete defined manufacturing order

		const queryRunner = this.tenancyService.dataSource.createQueryRunner()
		await queryRunner.startTransaction('READ UNCOMMITTED')
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
					await queryRunner.commitTransaction()
					await queryRunner.manager.update(RFIDMatchCustomerEntity, criteria, update)
					await queryRunner.manager.update(FPInventoryEntity, criteria, update)
				}
			}
		} catch (e) {
			await queryRunner.rollbackTransaction()
			throw new InternalServerErrorException(e.message)
		} finally {
			await queryRunner.release()
		}
	}

	public async dispatchApiCall() {
		try {
			const tenantId = String(this.request.headers['x-tenant-id'])
			const factoryCode = String(this.request.headers['x-user-company'])

			// * Prevent multiple sync process
			const syncProcessFlag = await this.thirdPartyApiHelper.getSyncProcess(factoryCode)
			if (syncProcessFlag) return

			// * First 22 characters in EPC will have the same manufacturing order code (mo_no)
			const unknownCustomerEpc = await this.tenancyService.dataSource
				.getRepository(FPInventoryEntity)
				.createQueryBuilder('inv')
				.select(/* SQL */ `DISTINCT MIN(inv.epc) AS epc`)
				.where(/* SQL */ `inv.rfid_status IS NULL`)
				.andWhere(/* SQL */ `inv.EPC_Code NOT LIKE :internalEpcPattern`)
				.andWhere(/* SQL */ `inv.EPC_Code NOT LIKE :excludedEpcPattern`)
				.andWhere(/* SQL */ `inv.mo_no IS NULL`)
				.groupBy(/* SQL */ `LEFT(inv.epc, :matchEpcCharLen)`)
				.setParameters({
					fallbackValue: FALLBACK_VALUE,
					internalEpcPattern: INTERNAL_EPC_PATTERN,
					excludedEpcPattern: EXCLUDED_EPC_PATTERN,
					matchEpcCharLen: MATCH_EPC_CHAR_LEN
				})
				.getRawMany()

			// * If exist customer's EPCs that do not have manufacturing order, emit event to synchronize
			if (unknownCustomerEpc.length === 0) return

			const distinctEpc = unknownCustomerEpc.map((item) => item.epc)

			// * Set cache flag to prevent multiple sync process

			await this.thirdPartyApiHelper.startSyncProcess(factoryCode)

			await this.eventEmitter.emitAsync(ThirdPartyApiEvent.DISPATCH, {
				params: { tenantId, factoryCode },
				data: distinctEpc
			} satisfies FetchThirdPartyApiEvent)
		} catch (error) {
			FileLogger.error(error)
		}
	}

	@OnEvent(ThirdPartyApiEvent.FULFILL)
	protected async onApiCallFulfill(e: SyncEventPayload) {
		try {
			// * Intialize datasource
			const tenant = this.tenancyService.findOneById(e.params.tenantId)
			const dataSource = new DataSource({
				...this.configService.getOrThrow<SqlServerConnectionOptions>('database'),
				host: tenant.host,
				database: DATABASE_DATA_LAKE,
				entities: [FPInventoryEntity, RFIDMatchCustomerEntity]
			})

			if (!dataSource.isInitialized) await dataSource.initialize()

			// * Read stored data from JSON assets
			const storedData = readFileSync(resolve(join(__dirname, '../..', `/assets/${e.data.file}`)), 'utf-8')
			const data = JSON.parse(storedData) as { epcs: ThirdPartyApiResponseData[] }
			if (!data?.epcs || !Array.isArray(data?.epcs)) throw new Error('Invalid data format')

			// * Get unknown customer EPC need to be upserted
			const unknownCustomerEpc = await dataSource.getRepository(FPInventoryEntity).findBy({
				rfid_status: IsNull(),
				epc: Not(Like(INTERNAL_EPC_PATTERN)),
				mo_no: IsNull()
			})

			// * Filter & Standardize manufacturing order codes
			const upsertData = data.epcs.filter((item) => unknownCustomerEpc.some((_item) => _item.epc === item.epc))

			const uniqCommandNumbers = [
				...new Set(upsertData.filter((item) => !!item).map((item) => item.commandNumber.slice(0, 9)))
			]

			// * Retrieve order information from ERP

			let orderInformation: Partial<RFIDMatchCustomerEntity>[] = []
			const orderInformationQuery = readFileSync(join(__dirname, './sql/order-information.sql'), 'utf-8').toString()

			for (const cmd of uniqCommandNumbers) {
				const orderInfo = await this.datasourceERP.query<Partial<RFIDMatchCustomerEntity>[]>(
					orderInformationQuery,
					[cmd]
				)
				if (orderInfo?.length === 0) continue
				orderInformation = [...orderInformation, ...orderInfo]
			}

			// * Upsert data to database
			const upsertPayload: Array<UpsertRFIDCustomerData> = uniqBy(orderInformation, 'mo_no').reduce((acc, curr) => {
				if (!curr.mo_no) {
					return acc
				} else {
					const commandNumber: string = curr.mo_no
					const items: UpsertRFIDCustomerData['items'] = upsertData
						.filter((item) => curr.mo_no === item.commandNumber.slice(0, 9))
						.map((item) => ({
							...curr,
							epc: item.epc,
							size_numcode: item.sizeNumber,
							factory_code_orders: e.params.factoryCode,
							factory_name_orders: e.params.factoryCode,
							factory_code_produce: e.params.factoryCode,
							factory_name_produce: e.params.factoryCode
						}))
					const upsertChunk: UpsertRFIDCustomerData = { commandNumber, items }
					return [...acc, upsertChunk]
				}
			}, [])

			await this.rfidRepository.upsertBulk(dataSource, upsertPayload)

			// * Reset data store
			writeFileSync(
				resolve(join(__dirname, '../..', `/assets/${e.data.file}`)),
				JSON.stringify({ epcs: [] }, null, 3)
			)
			FileLogger.info('Synchronized data from Decker API')
		} catch (error) {
			FileLogger.error(error)
		} finally {
			await this.thirdPartyApiHelper.exitSyncProcess(e.params.factoryCode)
		}
	}
}
