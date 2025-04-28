import { FileLogger } from '@/common/helpers'
import { DATA_SOURCE_DATA_LAKE, DATA_SOURCE_ERP } from '@/databases/constants'
import { TENANCY_DATA_SOURCE } from '@/modules/tenancy/constants'
import { InjectQueue } from '@nestjs/bullmq'
import { Inject, Injectable, InternalServerErrorException, NotFoundException, Scope } from '@nestjs/common'
import { REQUEST } from '@nestjs/core'
import { InjectModel } from '@nestjs/mongoose'
import { InjectDataSource } from '@nestjs/typeorm'
import { Queue } from 'bullmq'
import { format } from 'date-fns'
import { readFileSync } from 'fs'
import { chunk, pick } from 'lodash'
import { AnyBulkWriteOperation } from 'mongoose'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { join, resolve } from 'path'
import { DataSource, FindOptionsWhere, In } from 'typeorm'
import { POST_DATA_INBOUND_QUEUE } from '../constants'
import {
	ExchangeEpcDTO,
	ExchangeOrderDTO,
	PostReaderDataDTO,
	SearchCustOrderParamsDTO,
	UpsertStockInDTO
} from '../dto/rfid.dto'
import { RFIDMatchCustomerEntity } from '../entities/rfid-customer-match.entity'
import { EpcInbound, EpcInboundSchema, EpcModel } from '../schemas/epc.schema'

@Injectable({ scope: Scope.REQUEST })
export class RFIDInboundService {
	private readonly upsertInventoryQuery: string = readFileSync(
		resolve(join(__dirname, '../sql/upsert-inbound.sql')),
		'utf-8'
	)

	private readonly upsertEpcsQuery: string = readFileSync(
		resolve(join(__dirname, '../sql/upsert-rfid-match.sql')),
		'utf-8'
	)

	constructor(
		@Inject(REQUEST) private readonly request: Request,
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

	/**
	 * @description Cleanup the queue. All existing jobs around last 5 minutes will be removed
	 */
	public async cleanupQueue(): Promise<unknown[]> {
		const GRACE_PERIOD = 60 * 1000 * 5
		const QUANTITY = 1000
		return await Promise.all([
			this.postDataQueue.drain(),
			this.postDataQueue.clean(GRACE_PERIOD, QUANTITY, 'active'),
			this.postDataQueue.clean(GRACE_PERIOD, QUANTITY, 'paused'),
			this.postDataQueue.clean(GRACE_PERIOD, QUANTITY, 'failed'),
			this.postDataQueue.clean(GRACE_PERIOD, QUANTITY, 'completed')
		])
	}

	public async upsertStockIn(orderCode: string, data: UpsertStockInDTO) {
		const payload = await this.epcInboundModel.find({ scannable: true, mo_no: orderCode }).lean(true)
		const queryRunner = this.dataSourceTNC.createQueryRunner()
		const session = await this.epcInboundModel.startSession()
		await Promise.all([queryRunner.startTransaction(), session.startTransaction()])

		try {
			for (const item of chunk(
				payload.map((value) => ({
					...value,
					...data,
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

				await this.dataSourceDL.query(this.upsertInventoryQuery.replace(':values', values))
			}
			await this.epcInboundModel.delete({ mo_no: orderCode }).exec()
			await Promise.all([queryRunner.commitTransaction(), session.commitTransaction()])
		} catch (e) {
			await Promise.all([queryRunner.rollbackTransaction(), session.abortTransaction()])
			throw new InternalServerErrorException(e)
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
				mat_ecolor: payload.mat_ecolor,
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
			await Promise.all([session.startTransaction(), queryRunner.startTransaction('READ UNCOMMITTED')])
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

	public async exchangeEpcBySize(update: ExchangeEpcDTO) {
		const factoryCode = this.request.headers['x-user-company'] as string
		const epcToExchange = await this.epcInboundModel
			.find({
				...pick(update, ['mo_no', 'shoes_style_code_factory', 'mat_ecolor', 'size_numcode']),
				scannable: true
			})
			.select('epc')
			.limit(update.quantity)
			.lean(true)
		const payload = epcToExchange.map((item) => ({
			...update,
			epc: item.epc,
			mo_no: update.mo_no_actual,
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
			await Promise.all([session.startTransaction(), queryRunner.startTransaction()])

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
				await queryRunner.query(this.upsertEpcsQuery.replace(':values', values))
			}
			const bulkWriteOptions: AnyBulkWriteOperation<typeof EpcInboundSchema>[] = payload.map((item) => ({
				updateOne: {
					filter: { epc: item.epc, scannable: true },
					update: {
						$set: pick(item, ['mo_no', 'shoes_style_code_factory', 'mat_ecolor', 'size_numcode'])
					}
				}
			}))
			await this.epcInboundModel.bulkWrite(bulkWriteOptions)
			await Promise.all([queryRunner.commitTransaction(), session.commitTransaction()])
		} catch (error) {
			FileLogger.error(error)
			await Promise.all([session.abortTransaction(), queryRunner.rollbackTransaction()])
			throw new Error(error)
		} finally {
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
			.andWhere(/* SQL */ `a.cofactory_code = :factoryCode`)
			.andWhere(/* SQL */ `b.mat_ecolor = :color`)
			.andWhere(
				/* SQL */ `(
					(:factoryCode = 'VA1' AND RIGHT(LEFT(a.mo_no, 3), 1) = 'A') OR
					(:factoryCode = 'VB1' AND RIGHT(LEFT(a.mo_no, 3), 1) = 'B') OR
					(:factoryCode = 'VB2' AND RIGHT(LEFT(a.mo_no, 3), 1) = 'C') OR
					(:factoryCode = 'CA1' AND RIGHT(LEFT(a.mo_no, 3), 1) = 'D')
			  )`
			)
			.orderBy('a.mo_no', 'DESC')
			.addOrderBy('a.created', 'DESC')
			.setParameters({
				search: params['q'],
				factoryCode: params['factory_code.eq'],
				color: params['mat_ecolor.eq']
			})
			.getRawMany()
	}
}
