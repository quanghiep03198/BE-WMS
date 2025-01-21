import { FileLogger } from '@/common/helpers/file-logger.helper'
import { DATABASE_DATA_LAKE, DATA_SOURCE_DATA_LAKE, DATA_SOURCE_ERP } from '@/databases/constants'
import { InjectQueue } from '@nestjs/bullmq'
import { Inject, Injectable, InternalServerErrorException, NotFoundException, Scope } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { REQUEST } from '@nestjs/core'
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter'
import { InjectDataSource } from '@nestjs/typeorm'
import { Queue } from 'bullmq'
import { Request } from 'express'
import fs from 'fs-extra'
import { chunk, groupBy, omit, pick } from 'lodash'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { readFileSync, writeFileSync } from 'node:fs'
import path, { join, resolve } from 'node:path'
import { Brackets, DataSource, FindOptionsWhere, In } from 'typeorm'
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
	MATCH_EPC_CHAR_LEN,
	POST_DATA_QUEUE
} from './constants'
import { ExchangeEpcDTO, PostReaderDataDTO, SearchCustOrderParamsDTO, UpdateStockDTO } from './dto/rfid.dto'
import { FPInventoryEntity } from './entities/fp-inventory.entity'
import { RFIDMatchCustomerEntity } from './entities/rfid-customer-match.entity'
import { RFIDDataService } from './rfid.data.service'
import { FPIRespository } from './rfid.repository'
import { DeleteEpcBySizeParams, RFIDSearchParams, StoredRFIDReaderData } from './types'

/**
 * @description Service for Finished Production Inventory (FPI)
 */
@Injectable({ scope: Scope.REQUEST })
export class RFIDService {
	constructor(
		@InjectQueue(POST_DATA_QUEUE) private readonly postDataQueue: Queue,
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

	public async getIncomingEpcs(args: RFIDSearchParams) {
		const tenantId = this.request.headers['x-tenant-id']
		const dataFilePath = RFIDDataService.getInvDataFile(String(tenantId))
		const storedJsonData = fs.readJsonSync(dataFilePath) as StoredRFIDReaderData

		const epcs = storedJsonData.epcs
		const totalDocs = epcs.length
		const totalPages = Math.ceil(totalDocs / args._limit)

		const orderDetails = await this.getOrderDetailsByEpcs()

		return {
			epcs: {
				data: epcs.slice((args._page - 1) * args._limit, args._page * args._limit),
				totalDocs: totalDocs,
				totalPages: totalPages,
				limit: args._limit,
				page: args._page,
				hasNextPage: args._page < totalPages,
				hasPrevPage: args._page > 1
			},
			orders: orderDetails
		}
	}

	public async getOrderDetailsByEpcs() {
		const tenantId = this.request.headers['x-tenant-id']
		const accumulatedData = RFIDDataService.getInvScannedEpcs(String(tenantId))

		if (!Array.isArray(accumulatedData)) throw new Error('Invalid data format')

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

	/**
	 *	@description Post received data from Android RFID reader to queue for processing
	 * @param {string} tenantId
	 * @param {PostReaderDataDTO} payload
	 */
	public async postDataToQueue(tenantId: string, payload: PostReaderDataDTO) {
		await this.postDataQueue.add(tenantId, payload)
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

	public async deliverInventory(payload) {
		return await this.tenancyService.dataSource
			.createQueryBuilder()
			.insert()
			.into(FPInventoryEntity)
			.values(payload)
			.execute()
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
			// TODO: Delete from stored JSON data file
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
		// TODO: Implement update from stored JSON data file and dv_rfidmatchmst_cust table
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

	public async deleteEpcBySize(filters: DeleteEpcBySizeParams) {
		const queryRunner = this.tenancyService.dataSource.createQueryRunner()
		await queryRunner.startTransaction('READ UNCOMMITTED')

		try {
			await queryRunner.manager.query(
				/* SQL */ `
						DELETE FROM DV_DATA_LAKE.dbo.UHF_RFID_TEST WHERE epc IN (
							SELECT DISTINCT TOP 5 inv.EPC_Code AS epc FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet inv
							LEFT JOIN DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust mat ON inv.EPC_Code = mat.EPC_Code
							WHERE COALESCE(inv.mo_no_actual, inv.mo_no) = @0
							AND mat.size_numcode = @1
						)`,
				[filters['mo_no.eq'], filters['size_num_code.eq']]
			)
			// TODO: Delete from stored JSON data file
			await queryRunner.manager.query(
				/* SQL */ `
				DELETE FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet WHERE EPC_Code IN (
					SELECT DISTINCT TOP 5 inv.EPC_Code FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet inv
					LEFT JOIN DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust mat ON inv.EPC_Code = mat.EPC_Code
					WHERE COALESCE(inv.mo_no_actual, inv.mo_no) = @0
					AND mat.size_numcode = @1
				)`,
				[filters['mo_no.eq'], filters['size_num_code.eq']]
			)

			await queryRunner.commitTransaction()
		} catch (error) {
			await queryRunner.rollbackTransaction()
			throw new InternalServerErrorException(error)
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
			if (unknownCustomerEpc.length === 0) return { affected: 0 }

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

	/**
	 * @deprecated
	 * This method will be migrated to Redis BullMQ to handle for better performance in the future
	 */
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
			const storedData = readFileSync(resolve(join(__dirname, '../..', `/data/__DECKER__/${e.data.file}`)), 'utf-8')
			const data = JSON.parse(storedData) as { epcs: ThirdPartyApiResponseData[] }
			if (!data?.epcs || !Array.isArray(data?.epcs)) throw new Error('Invalid data format')

			// * Retrieve unique command numbers from Third Party API response data
			const availableCommandNums = Object.keys(groupBy(data.epcs, 'commandNumber')).map((item) => item.slice(0, 9)) // * Extract first 9 characters
			const uniqueCommandNums = [...new Set(availableCommandNums)]

			// * Retrieve order information from ERP
			let orderInformation: Partial<RFIDMatchCustomerEntity>[] = []
			const orderInformationQuery = readFileSync(join(__dirname, './sql/order-information.sql'), 'utf-8').toString()

			for (const cmd of uniqueCommandNums) {
				const orderInfo = await this.datasourceERP.query<Partial<RFIDMatchCustomerEntity>[]>(
					orderInformationQuery,
					[cmd]
				)
				if (orderInfo?.length === 0) continue
				orderInformation = [...orderInformation, ...orderInfo]
			}

			// * Upsert data to database
			const payload: Partial<RFIDMatchCustomerEntity>[] = data.epcs.map((item) => ({
				...orderInformation.find((data) => data.mo_no === item.commandNumber.slice(0, 9)),
				epc: item.epc,
				size_numcode: item.sizeNumber,
				factory_code_orders: e.params.factoryCode,
				factory_name_orders: e.params.factoryCode,
				factory_code_produce: e.params.factoryCode,
				factory_name_produce: e.params.factoryCode
			}))

			await this.rfidRepository.upsertBulk(dataSource, payload)

			// * Reset data store
			writeFileSync(
				resolve(join(__dirname, '../..', `/data/__DECKER__/${e.data.file}`)),
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
