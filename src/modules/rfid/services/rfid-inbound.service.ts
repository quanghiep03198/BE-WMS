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
import { AnyBulkWriteOperation, FilterQuery } from 'mongoose'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { join, resolve } from 'path'
import { DataSource, FindOptionsWhere, In } from 'typeorm'
import { POST_DATA_INBOUND_QUEUE } from '../constants'
import {
	DeleteScannedEpcDTO,
	ExchangeEpcDTO,
	ExchangeOrderDTO,
	PostReaderDataDTO,
	SearchCustOrderParamsDTO,
	UpsertStockInDTO
} from '../dto/rfid.dto'
import { RFIDMatchCustomerEntity } from '../entities/rfid-customer-match.entity'
import { EpcDocument, EpcInbound, EpcInboundSchema, EpcModel } from '../schemas/epc.schema'
import { RFIDSearchParams } from '../types'

@Injectable({ scope: Scope.REQUEST })
export class RFIDInboundService {
	private readonly upsertInventoryQuery: string = readFileSync(
		resolve(join(__dirname, '../sql/upsert-inventory.sql')),
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

	public async fetchLatestInboundData(args: RFIDSearchParams) {
		const [epcs, orders] = await Promise.all([this.getIncomingInboundEpcs(args), this.getInboundOrderDetails()])
		return { epcs, orders }
	}

	public async getIncomingInboundEpcs(args: RFIDSearchParams) {
		const factoryCode = this.request.headers['x-user-company']
		const filterQuery: FilterQuery<EpcDocument> = {
			scannable: true,
			station_no: { $regex: new RegExp(`CUS_${factoryCode}_WH10[12]`) },
			mo_no: args['mo_no.eq']
		}
		if (!args['mo_no.eq']) delete filterQuery.mo_no

		return await this.epcInboundModel.paginate(filterQuery, {
			sort: { record_time: -1, epc: 1, mo_no: 1 },
			select: ['epc', 'mo_no'],
			lean: true,
			page: args._page,
			limit: args._limit,
			options: { readPreference: 'nearest' },
			customLabels: { docs: 'data' }
		})
	}

	public async getInboundOrderDetails() {
		return await this.epcInboundModel.aggregate(
			[
				// * Stage 1: Match documents that are not deleted
				{ $match: { deleted: false, scannable: true } },
				// * Stage 2: Group by mo_no, mat_ecolor, and shoes_style_code_factory, and aggregate sizes
				{
					$group: {
						_id: {
							mo_no: '$mo_no',
							mat_ecolor: '$mat_ecolor',
							shoes_style_code_factory: '$shoes_style_code_factory',
							factory_code_produce: '$factory_code_produce',
							size_numcode: '$size_numcode'
						},
						count: { $sum: 1 }
					}
				},
				// * Stage 3: Reshape the data to group sizes into an array
				{
					$group: {
						_id: {
							mo_no: '$_id.mo_no',
							mat_ecolor: '$_id.mat_ecolor',
							factory_code_produce: '$_id.factory_code_produce',
							shoes_style_code_factory: '$_id.shoes_style_code_factory'
						},
						sizes: {
							$push: {
								size_numcode: '$_id.size_numcode',
								count: '$count'
							}
						}
					}
				},
				// * Stage 4: Reshape the final output
				{
					$project: {
						_id: 0,
						mo_no: '$_id.mo_no',
						mat_ecolor: '$_id.mat_ecolor',
						factory_code_produce: '$_id.factory_code_produce',
						shoes_style_code_factory: '$_id.shoes_style_code_factory',
						sizes: 1
					}
				},
				// * Stage 5: Sort the results
				{ $sort: { mo_no: 1, mat_ecolor: 1, shoes_style_code_factory: 1 } }
			],
			{ readPreference: 'nearest' }
		)
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

	public async deleteScannedInboundEpcs(filters: DeleteScannedEpcDTO) {
		const filterQuery: FilterQuery<EpcInbound> = !filters['size_numcode.eq'] ? pick(filters, 'mo_no.eq') : filters
		if (filterQuery['size_numcode.eq'] && filterQuery['quantity.eq']) {
			const epcsToDelete = await this.epcInboundModel
				.find({
					mo_no: filters['mo_no.eq'],
					size_numcode: filters['size_numcode.eq']
				})
				.limit(filters['quantity.eq'])
				.lean(true)

			return await this.epcInboundModel
				.updateMany(
					{
						epc: { $in: epcsToDelete.map((item) => item.epc) }
					},
					{ deleted: true, scannable: !filters['f'] },
					{ new: true }
				)
				.exec()
		}
		return await this.epcInboundModel
			.updateMany({ mo_no: filters['mo_no.eq'] }, { deleted: true, scannable: !filters['f'] })
			.exec()
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
		return await this.dataSourceERP.query(
			/* SQL */ `
            SELECT a.mo_no FROM wuerp_vnrd.dbo.ta_manufacturmst a
            LEFT JOIN wuerp_vnrd.dbo.ta_productmst b ON b.mat_code = a.mat_code AND b.isactive = 'Y'
            LEFT JOIN wuerp_vnrd.dbo.ta_shoefactorymst c ON c.shoestyle_systemcodefty = b.shoestyle_systemcodefty AND c.isactive = 'Y'
            WHERE 
               a.created >= CAST(DATEADD(YEAR, -2, GETDATE()) AS DATE)
               AND a.mo_no LIKE CONCAT('%', @0, '%')
               AND a.cofactory_code = @1
               AND b.mat_ecolor = @2
            ORDER BY a.created DESC
            `,
			[params.q, params['factory_code.eq'], params['mat_ecolor.eq']]
		)
	}
}
