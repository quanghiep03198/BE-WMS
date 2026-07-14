import { VALID_EPC_PATTERN } from '@common/constants/regex'
import { DATA_SOURCE_DATA_LAKE, DATA_SOURCE_ERP, DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { IUpsertInventoryEventPayload } from '@modules/inventory/interfaces'
import { InjectQueue } from '@nestjs/bullmq'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import {
	BadRequestException,
	Inject,
	Injectable,
	InternalServerErrorException,
	NotFoundException,
	Scope
} from '@nestjs/common'
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter'
import { InjectModel } from '@nestjs/mongoose'
import { InjectDataSource } from '@nestjs/typeorm'
import { Queue } from 'bullmq'
import { Cache } from 'cache-manager'
import { format } from 'date-fns'
import { chunk, pick } from 'lodash'
import { AnyBulkWriteOperation, FilterQuery } from 'mongoose'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { PinoLogger } from 'nestjs-pino'
import { DataSource, FindOptionsWhere, In } from 'typeorm'
import { FALLBACK_VALUE } from '../../domain/constants'
import { ExchangeOrderDTO, StockInDTO, UpsertEpcInformationDTO } from '../../presentation/dto/rfid-inbound.dto'
import { PostReaderDataDTO, SearchCustOrderParamsDTO } from '../../presentation/dto/rfid-shared.dto'

import { POST_DATA_INBOUND_QUEUE } from '../../infrastructure/constants/queue'
import {
	EpcDocument,
	EpcInbound,
	EpcInboundSchema,
	EpcModel
} from '../../infrastructure/persistence/mongodb/schemas/finished-goods-epc.schema'
import { RFIDInventoryBackupEntity } from '../../infrastructure/persistence/mssql/entities/rfid-inventory.entity'
import { RFIDMatchEntity } from '../../infrastructure/persistence/mssql/entities/rfid-match.entity'
import moInboundProgressQuery from '../../infrastructure/persistence/mssql/sql/mo-inbound-progress.sql'
import upsertInboundQuery from '../../infrastructure/persistence/mssql/sql/upsert-inbound.sql'
import upsertRfidMatchQuery from '../../infrastructure/persistence/mssql/sql/upsert-rfid-match.sql'
import { RFIDSearchParams } from '../../infrastructure/types'
import { generateStation } from '../../infrastructure/utils'
import { FinishedGoodsGateway } from '../../presentation/gateways/inoutbound.gateway'

@Injectable({ scope: Scope.REQUEST })
export class RFIDInboundService {
	private readonly missingInboundQtyQuery: string = moInboundProgressQuery

	constructor(
		@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly dataSourceDL: DataSource,
		@InjectDataSource(DATA_SOURCE_ERP) private readonly dataSourceERP: DataSource,
		@InjectQueue(POST_DATA_INBOUND_QUEUE) private readonly postDataQueue: Queue<PostReaderDataDTO>,
		@InjectModel(EpcInbound.name, DATA_WAREHOUSE_CONNECTION) private readonly epcInboundModel: EpcModel,
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
		private readonly i18nService: I18nService,
		// private readonly inventoryAuditService: InventoryAuditService,
		private readonly eventEmitter: EventEmitter2,
		private readonly eventGateway: FinishedGoodsGateway,
		private readonly logger: PinoLogger
	) {}

	/**
	 * @deprecated
	 */
	public async postInboundRFIDData(data: PostReaderDataDTO) {
		const isDeduplicationEnabled = await this.cacheManager.get<boolean>('cached:rfid:enable_deduplicate_inbound_epc')
		if (!isDeduplicationEnabled)
			await this.eventEmitter.emitAsync(
				'rfid.inbound.check',
				data.data.tagList.map((item) => item.epc)
			)
		return await this.postDataQueue.add('RFID_INBOUND', data, { lifo: true })
	}

	public async upsertStockIn(commandNumber: string, factoryCode: string, data: StockInDTO) {
		const payload = await this.epcInboundModel.find({ scannable: true, mo_no: commandNumber }).lean(true)
		const queryRunner = this.dataSourceDL.createQueryRunner()
		const session = await this.epcInboundModel.startSession()
		const missingOrderSizeQty = await this.dataSourceDL.query<
			Array<{
				size_numcode: string
				missing_qty: number
			}>
		>(this.missingInboundQtyQuery, [commandNumber, JSON.stringify(payload)])

		const excessInboundQuantities = missingOrderSizeQty.filter((size) => size.missing_qty < 0)

		if (excessInboundQuantities.length > 0)
			throw new BadRequestException(
				this.i18nService.t('inoutbound.notification.over_inbound_limit', { lang: I18nContext.current()?.lang }),
				{ cause: excessInboundQuantities }
			)

		try {
			const upsertInventoryQuery: string = upsertInboundQuery
			await session.startTransaction()
			await queryRunner.startTransaction()

			const upsertPayload = payload.map((value) => {
				const factory = value.factory_code_produce ?? factoryCode
				return {
					...value,
					...data,
					factory_code: factory,
					station_no: generateStation(factory, 'WH101'),
					record_time: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
				}
			})

			await Promise.all(
				chunk(upsertPayload, 100).map(async (item) => {
					return await this.dataSourceDL.query(upsertInventoryQuery, [JSON.stringify(item)])
				})
			)

			const sizeCodes = Object.keys(Object.groupBy(payload, (item) => item.size_numcode))

			await this.epcInboundModel
				.updateMany({ mo_no: commandNumber }, { $set: { deleted: true, stored_at: new Date() } })
				.exec()
			await queryRunner.commitTransaction()
			await session.commitTransaction()
			await this.eventEmitter.emitAsync('inventory.inbound', {
				mo_no: commandNumber,
				sizes: sizeCodes,
				username: data['username'],
				display_name: data['display_name']
			} satisfies Omit<IUpsertInventoryEventPayload, 'po'>)
		} catch (error) {
			this.logger.error(error)
			if (session.inTransaction()) await session.abortTransaction()
			if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction()
			throw new InternalServerErrorException(error)
		} finally {
			if (!session.hasEnded) await session.endSession()
			if (!queryRunner.isReleased) await queryRunner.release()
		}
	}

	public async exchangeEpcByCommandNumber(payload: ExchangeOrderDTO) {
		const queryRunner = this.dataSourceDL.createQueryRunner()
		const session = await this.epcInboundModel.startSession()
		const epcToExchange = await this.epcInboundModel.distinct(
			'epc',
			{
				deleted: false,
				scannable: true,
				mo_no: { $in: payload.mo_no.split(',').map((m) => m.trim()) },
				color_sn: payload.color_sn,
				factory_shoes_style: payload.factory_shoes_style
			},
			{ lean: true }
		)

		if (epcToExchange.length === 0) {
			throw new NotFoundException(
				this.i18nService.t('rfid.errors.no_matching_epc', { lang: I18nContext.current().lang })
			)
		}
		const currentTimestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss')
		try {
			await session.startTransaction()
			await queryRunner.startTransaction()

			for (const epcBatch of chunk(epcToExchange, 2000)) {
				const criteria: FindOptionsWhere<RFIDMatchEntity> = {
					epc: In(epcBatch)
				}
				await queryRunner.manager.update(RFIDMatchEntity, criteria, {
					mo_no: payload.mo_no_actual,
					remark: `[${currentTimestamp}] Info: Exchanged from M.O "${payload.mo_no}"`
				})
			}
			await this.epcInboundModel.updateMany(
				{ epc: { $in: epcToExchange }, mo_no: { $ne: payload.mo_no_actual } },
				{ mo_no: payload.mo_no_actual }
			)
			await queryRunner.commitTransaction()
			await session.commitTransaction()
		} catch (error) {
			await Promise.all([queryRunner.rollbackTransaction(), session.abortTransaction()])
			throw new InternalServerErrorException(error)
		} finally {
			if (!queryRunner.isReleased) await queryRunner.release()
		}
	}

	public async upsertEpcInformation(factoryCode: string, update: UpsertEpcInformationDTO) {
		const epcToExchange = await this.epcInboundModel.find(
			{
				...pick(update, ['mo_no', 'factory_shoes_style', 'color_sn', 'size_numcode']),
				deleted: false,
				scannable: true
			},
			{ _id: 0, epc: 1 },
			{ limit: update.quantity, lean: true }
		)

		const currentTimestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss')

		const payload = epcToExchange.map(({ epc }) => ({
			...update,
			epc,
			mo_no: update.mo_no_actual,
			factory_shoes_style: update.factory_shoes_style_actual,
			color_sn: update.color_sn_actual,
			size_numcode: update.size_numcode_actual,
			factory_code_orders: factoryCode,
			factory_name_orders: factoryCode,
			factory_code_produce: factoryCode,
			factory_name_produce: factoryCode,
			remark:
				update.mo_no === FALLBACK_VALUE
					? `[${currentTimestamp}] Info: Combined from WMS`
					: `[${currentTimestamp}] Info: Exchanged from M.O "${update.mo_no}" and Size "${update.size_numcode}"`
		}))

		return await this.bulkUpsertRFIDRecords(payload)
	}

	public async bulkUpsertRFIDRecords(
		payload: Array<
			Partial<RFIDMatchEntity> & {
				size_sumqty?: number
			}
		>
	): Promise<void> {
		const session = await this.epcInboundModel.startSession()
		const queryRunner = this.dataSourceDL.createQueryRunner()
		await queryRunner.connect()

		const currentTimestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss')

		try {
			const upsertEpcsQuery: string = upsertRfidMatchQuery

			await session.startTransaction()
			await queryRunner.startTransaction()

			for (const data of chunk(payload, 100)) {
				const upsertSourceData = data.map((item) => ({
					...item,
					cust_shoes_style: item.cust_shoes_style?.replace('/', '\/'),
					size_qty: item.size_sumqty ?? 1,
					remark: item.remark ?? `[${currentTimestamp}] Info: Upserted from WMS`
				}))

				await queryRunner.manager.query(upsertEpcsQuery, [JSON.stringify(upsertSourceData)])
			}

			const bulkWriteOptions: AnyBulkWriteOperation<typeof EpcInboundSchema>[] = payload.map((item) => ({
				updateOne: {
					filter: { epc: item.epc, deleted: false, scannable: true },
					update: {
						$set: pick(item, ['mo_no', 'factory_shoes_style', 'color_sn', 'size_numcode', 'factory_code_produce'])
					}
				}
			}))

			await this.epcInboundModel.bulkWrite(bulkWriteOptions, {
				session,
				writeConcern: { w: 'majority' },
				readPreference: 'nearest',
				ordered: false,
				retryWrites: true
			})

			await session.commitTransaction()
			await queryRunner.commitTransaction()
		} catch (error) {
			this.logger.error(error)
			if (session.inTransaction()) await session.abortTransaction()
			if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction()
			throw new InternalServerErrorException(error)
		} finally {
			if (!session.hasEnded) await session.endSession()
			if (!queryRunner.isReleased) await queryRunner.release()
		}
	}

	public async searchExchangableOrder(params: SearchCustOrderParamsDTO) {
		return await this.dataSourceERP
			.createQueryBuilder()
			.select(/* SQL */ `DISTINCT TOP 5 a.mo_no AS mo_no`)
			.addSelect(/* SQL */ `a.created`, 'created')
			.from('ta_manufacturmst', 'a')
			.leftJoin('ta_productmst', 'b', /* SQL */ `b.mat_code = a.mat_code AND b.isactive = 'Y'`)
			.leftJoin(
				'ta_shoefactorymst',
				'c',
				/* SQL */ `c.shoestyle_systemcodefty = b.shoestyle_systemcodefty AND c.isactive = 'Y'`
			)
			.where(/* SQL */ `a.created >= CAST(DATEADD(YEAR, -2, GETDATE()) AS DATE)`)
			.andWhere(/* SQL */ `a.mo_no LIKE CONCAT('%',:search, '%')`)
			.andWhere(/* SQL */ `b.color_sn = :color`)
			.andWhere(
				/* SQL */ `(
					(:factoryCode = 'VA1' AND RIGHT(LEFT(a.mo_no, 3), 1) = 'A') OR
					(:factoryCode = 'VB1' AND RIGHT(LEFT(a.mo_no, 3), 1) = 'B') OR
					(:factoryCode = 'VB2' AND RIGHT(LEFT(a.mo_no, 3), 1) = 'C') OR
					(:factoryCode = 'CA1' AND RIGHT(LEFT(a.mo_no, 3), 1) = 'D')
			  )`
			)
			// .andWhere(/* SQL */ `a.cofactory_code = :factoryCode`)
			.orderBy('a.mo_no', 'DESC')
			.addOrderBy('a.created', 'DESC')
			.setParameters({
				search: params['q'],
				factoryCode: params['factory_code:eq'],
				color: params['color_sn:eq']
			})
			.getRawMany<{ mo_no: string; created: Date }>()
	}

	public async retrieveDeletedEpcs(factoryCode: string, args: RFIDSearchParams & { 'scannable:eq'?: boolean }) {
		const filterQuery: FilterQuery<EpcDocument> = {
			deleted: true,
			stored_at: null,
			epc: { $regex: VALID_EPC_PATTERN },
			factory_code_produce: factoryCode,
			...(typeof args['scannable:eq'] === 'boolean' && { scannable: args['scannable:eq'] }),
			...(args['epc:contains'] && { epc: { $regex: args['epc:contains'], $options: 'i' } }),
			...(args['mo_no:eq'] && { mo_no: args['mo_no:eq'] }),
			...(args['size_numcode:eq'] && { size_numcode: args['size_numcode:eq'] }),
			...(args['shoes_style:eq'] && { factory_shoes_style: args['shoes_style:eq'] }),
			...(args['color_sn:eq'] && { color_sn: args['color_sn:eq'] })
		}

		return await this.epcInboundModel.paginate(filterQuery, {
			sort: { record_time: -1, epc: 1, mo_no: 1 },
			lean: true,
			leanWithId: true,
			page: args._page,
			limit: args._limit,
			options: { readPreference: 'nearest' },
			customLabels: { docs: 'data' },
			customFind: 'findDeleted',
			useCustomCountFn: async () => await this.epcInboundModel.countDocumentsDeleted(filterQuery),
			projection: {
				_id: 0,
				epc: 1,
				mo_no: 1,
				factory_shoes_style: 1,
				color_sn: 1,
				size_numcode: 1,
				scannable: 1
			}
		})
	}

	@OnEvent('rfid.inbound.check', { async: true })
	public async handleCheckRescannedEpcs(epcs: string[]) {
		const alreadyScannedEpcs = await this.dataSourceDL
			.getRepository(RFIDInventoryBackupEntity)
			.createQueryBuilder('a')
			.select([
				'DISTINCT a.EPC_Code AS epc',
				'a.mo_no AS mo_no',
				'b.factory_shoes_style AS factory_shoes_style',
				'c.color_sn AS color_sn',
				'a.size_code AS size_numcode',
				'a.record_time AS record_time'
			])
			.leftJoin(
				(qb) =>
					qb
						.subQuery()
						.select('EPC_Code', 'epc')
						.addSelect('mat_code', 'mat_code')
						.addSelect('shoestyle_codefactory', 'factory_shoes_style')
						.from('DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust', 'b'),
				'b',
				'a.EPC_Code = b.epc'
			)
			.leftJoin(
				(qb) => qb.subQuery().select('mat_code').addSelect('color_sn').from('wuerp_vnrd.dbo.ta_productmst', 'c'),
				'c',
				'c.mat_code = b.mat_code'
			)
			.where(/* SQL */ `a.EPC_Code IN (:...epcs)`, { epcs })
			.orderBy('a.record_time', 'DESC')
			.getRawMany<{
				epc: string
				mo_no: string
				factory_shoes_style: string
				color_sn: string
				size_numcode: string
				record_time: Date
			}>()

		this.eventGateway.server.emit('rfid.inbound.check', alreadyScannedEpcs)
	}
}
