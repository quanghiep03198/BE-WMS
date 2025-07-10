import { EXCLUDED_EPC_REGEX } from '@/common/constants/regex'
import { DATA_SOURCE_DATA_LAKE, DATA_SOURCE_ERP } from '@/databases/constants'
import { TENANCY_DATA_SOURCE } from '@/modules/tenancy/constants'
import { InjectQueue } from '@nestjs/bullmq'
import { Inject, Injectable, InternalServerErrorException, Logger, NotFoundException, Scope } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { InjectDataSource } from '@nestjs/typeorm'
import { Queue } from 'bullmq'
import { format } from 'date-fns'
import { readFileSync } from 'fs'
import { chunk, pick } from 'lodash'
import { AnyBulkWriteOperation, FilterQuery } from 'mongoose'
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { join, resolve } from 'path'
import { DataSource, FindOptionsWhere, In } from 'typeorm'
import { POST_DATA_INBOUND_QUEUE } from '../constants'
import {
	ExchangeOrderDTO,
	PostReaderDataDTO,
	SearchCustOrderParamsDTO,
	UpsertEpcInformationDTO,
	UpsertStockInDTO
} from '../dto/rfid.dto'
import { RFIDMatchCustomerEntity } from '../entities/rfid-customer-match.entity'
import { EpcDocument, EpcInbound, EpcInboundSchema, EpcModel } from '../schemas/epc.schema'
import { RFIDSearchParams } from '../types'

@Injectable({ scope: Scope.REQUEST })
export class RFIDInboundService {
	constructor(
		@Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
		@Inject(TENANCY_DATA_SOURCE) private readonly dataSourceTNC: DataSource,
		@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly dataSourceDL: DataSource,
		@InjectDataSource(DATA_SOURCE_ERP) private readonly dataSourceERP: DataSource,
		@InjectQueue(POST_DATA_INBOUND_QUEUE) private readonly postDataQueue: Queue<PostReaderDataDTO>,
		@InjectModel(EpcInbound.name) private readonly epcInboundModel: EpcModel,
		private readonly i18nService: I18nService
	) {}

	public async postInboundRFIDData(data: PostReaderDataDTO) {
		return await this.postDataQueue.add('RFID_INBOUND', data, { lifo: true })
	}

	public async upsertStockIn(orderCode: string, factoryCode: string, data: UpsertStockInDTO) {
		const payload = await this.epcInboundModel.find({ scannable: true, mo_no: orderCode }).lean(true)
		const queryRunner = this.dataSourceTNC.createQueryRunner()
		const session = await this.epcInboundModel.startSession()

		try {
			const upsertInventoryQuery: string = readFileSync(
				resolve(join(__dirname, '../sql/upsert-inbound.sql')),
				'utf-8'
			)
			await session.startTransaction()
			await queryRunner.startTransaction()

			for (const item of chunk(
				payload.map((value) => ({
					...value,
					...data,
					factory_code: factoryCode,
					record_time: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
				})),
				100
			)) {
				const values = item
					.map((value) => {
						return `(
							'${value.epc}', '${value.mo_no}', '${value.size_numcode}', '${value.rfid_status}', '${value.rfid_use}', '${value.record_time}', '${value.station_no}',
							'${value.quantity}', '${value.storage}', '${value.factory_code}', '${value.dept_code}', '${value.dept_name}'
                  )`
					})
					.join(',')

				await this.dataSourceDL.query(upsertInventoryQuery.replace(':values', values))
			}
			await this.epcInboundModel
				.updateMany(
					{ mo_no: orderCode },
					{ $set: { deleted: true, stored_at: new Date(), factory_code_produce: factoryCode } }
				)
				.exec()
			await queryRunner.commitTransaction()
			await session.commitTransaction()
		} catch (error) {
			this.logger.error(error)
			if (session.inTransaction()) await session.abortTransaction()
			if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction()
			throw new InternalServerErrorException(error.message)
		} finally {
			if (!session.hasEnded) await session.endSession()
			await queryRunner.release()
		}
	}

	public async exchangeEpcByCommandNumber(payload: ExchangeOrderDTO) {
		const queryRunner = this.dataSourceDL.createQueryRunner()
		const session = await this.epcInboundModel.startSession()
		const epcToExchange = await this.epcInboundModel
			.find({
				deleted: false,
				scannable: true,
				mo_no: { $in: payload.mo_no.split(',').map((m) => m.trim()) },
				color_sn: payload.color_sn,
				shoes_style_code_factory: payload.shoes_style_code_factory
			})
			.select('epc')
			.lean(true)

		if (epcToExchange.length === 0) {
			throw new NotFoundException(
				this.i18nService.t('rfid.errors.no_matching_epc', { lang: I18nContext.current().lang })
			)
		}
		try {
			await session.startTransaction()
			await queryRunner.startTransaction()

			for (const epcBatch of chunk(
				epcToExchange.map((item) => item.epc),
				2000
			)) {
				const criteria: FindOptionsWhere<RFIDMatchCustomerEntity> = {
					epc: In(epcBatch)
				}
				await queryRunner.manager.update(RFIDMatchCustomerEntity, criteria, { mo_no: payload.mo_no_actual })
			}
			await this.epcInboundModel.updateMany(
				{ epc: { $in: epcToExchange.map((item) => item.epc) }, mo_no: { $ne: payload.mo_no_actual } },
				{ mo_no: payload.mo_no_actual }
			)
			await queryRunner.commitTransaction()
			await session.commitTransaction()
		} catch (e) {
			await Promise.all([queryRunner.rollbackTransaction(), session.abortTransaction()])
			throw new InternalServerErrorException(e.message)
		} finally {
			await queryRunner.release()
		}
	}

	public async upsertEpcInformation(factoryCode: string, update: UpsertEpcInformationDTO) {
		const epcToExchange = await this.epcInboundModel
			.find({
				...pick(update, ['mo_no', 'shoes_style_code_factory', 'color_sn', 'size_numcode']),
				scannable: true
			})
			.select('epc')
			.limit(update.quantity)
			.lean(true)

		const payload = epcToExchange.map((item) => ({
			...update,
			epc: item.epc,
			mo_no: update.mo_no_actual,
			shoes_style_code_factory: update.shoes_style_code_factory_actual,
			color_sn: update.color_sn_actual,
			size_numcode: update.size_numcode_actual,
			factory_code_orders: factoryCode,
			factory_name_orders: factoryCode,
			factory_code_produce: factoryCode,
			factory_name_produce: factoryCode,
			remark: 'Upserted from WMS'
		}))
		return await this.bulkUpsertRFIDRecords(payload)
	}

	public async bulkUpsertRFIDRecords(payload: Partial<RFIDMatchCustomerEntity>[]): Promise<void> {
		const session = await this.epcInboundModel.startSession()
		const queryRunner = this.dataSourceDL.createQueryRunner()
		await queryRunner.connect()

		try {
			const upsertEpcsQuery: string = readFileSync(resolve(join(__dirname, '../sql/upsert-rfid-match.sql')), 'utf-8')

			await session.startTransaction()
			await queryRunner.startTransaction()

			for (const data of chunk(payload, 2000)) {
				const values = data
					.map((item) => {
						return `(
							'${item.epc}', '${item.mo_no}', '${item.mat_code}', '${item.mo_noseq}', '${item.or_no}', '${item.or_cust_po}', 
							'${item.shoes_style_code_factory}', '${item.cust_shoes_style.replace('/', '\/')}', '${item.size_code}', '${item.size_numcode}',
							'${item.factory_code_orders}', '${item.factory_name_orders}', '${item.factory_code_produce}', '${item.factory_name_produce}', ${item.size_qty || 1},
							'${item.remark ?? ''}'
						)`
					})
					.join(',')
				await queryRunner.query(upsertEpcsQuery.replace(':values', values))
			}

			const bulkWriteOptions: AnyBulkWriteOperation<typeof EpcInboundSchema>[] = payload.map((item) => ({
				updateOne: {
					filter: { epc: item.epc, scannable: true },
					update: {
						$set: pick(item, [
							'mo_no',
							'shoes_style_code_factory',
							'color_sn',
							'size_numcode',
							'factory_code_produce'
						])
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
			throw new Error(error.message)
		} finally {
			if (!session.hasEnded) await session.endSession()
			await queryRunner.release()
		}
	}

	public async searchExchangableOrder(params: SearchCustOrderParamsDTO) {
		return await this.dataSourceERP
			.createQueryBuilder()
			.select(/* SQL */ `DISTINCT TOP 5 a.mo_no`)
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
				factoryCode: params['factory_code.eq'],
				color: params['color_sn.eq']
			})
			.getRawMany()
	}

	public async retrieveDeletedEpcs(factoryCode: string, args: RFIDSearchParams & { 'scannable.eq'?: boolean }) {
		const filterQuery: FilterQuery<EpcDocument> = {
			deleted: true,
			stored_at: null,
			epc: { $not: { $regex: EXCLUDED_EPC_REGEX } },
			factory_code_produce: factoryCode,
			...(typeof args['scannable.eq'] === 'boolean' && { scannable: args['scannable.eq'] }),
			...(args.q && { epc: { $regex: args.q, $options: 'i' } }),
			...(args['mo_no.eq'] && { mo_no: args['mo_no.eq'] }),
			...(args['size_numcode.eq'] && { size_numcode: args['size_numcode.eq'] }),
			...(args['shoes_style.eq'] && { shoes_style_code_factory: args['shoes_style.eq'] }),
			...(args['color_sn.eq'] && { color_sn: args['color_sn.eq'] })
		}

		return await this.epcInboundModel.paginate(filterQuery, {
			sort: { record_time: -1, epc: 1, mo_no: 1 },
			lean: true,
			page: args.page,
			limit: args.limit,
			options: { readPreference: 'nearest' },
			customLabels: { docs: 'data' },
			customFind: 'findDeleted',
			useCustomCountFn: async () => await this.epcInboundModel.countDocumentsDeleted(filterQuery),
			projection: {
				_id: 0
			}
		})
	}
}
