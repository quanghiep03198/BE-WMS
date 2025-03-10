import { InjectQueue } from '@nestjs/bullmq'
import { Inject, Injectable, InternalServerErrorException, NotFoundException, Scope } from '@nestjs/common'
import { REQUEST } from '@nestjs/core'
import { InjectModel } from '@nestjs/mongoose'
import { Queue } from 'bullmq'
import { format } from 'date-fns'
import { Request } from 'express'
import { readFileSync } from 'fs-extra'
import { chunk, groupBy, pick } from 'lodash'
import { FilterQuery, RootFilterQuery } from 'mongoose'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { join, resolve } from 'path'
import { DataSource, FindOptionsWhere, In } from 'typeorm'
import { TENANCY_DATASOURCE } from '../tenancy/constants'
import { POST_DATA_QUEUE } from './constants'
import {
	DeleteScannedEpcDTO,
	ExchangeEpcDTO,
	ExchangeOrderDTO,
	PostReaderDataDTO,
	SearchCustOrderParamsDTO,
	UpsertStockDTO
} from './dto/rfid.dto'
import { RFIDMatchCustomerEntity } from './entities/rfid-customer-match.entity'
import { FPIRespository } from './rfid.repository'
import { Epc, EpcDocument, EpcModel } from './schemas/epc.schema'
import { RFIDSearchParams, StoredRFIDReaderItem } from './types'

/**
 * @description Service for Finished Production Inventory (FPI)
 */
@Injectable({ scope: Scope.REQUEST })
export class RFIDService {
	private readonly upsertInventoryQuery = readFileSync(resolve(join(__dirname, './sql/upsert-inventory.sql')), 'utf-8')

	constructor(
		@Inject(REQUEST) private readonly request: Request,
		@Inject(TENANCY_DATASOURCE) private readonly dataSource: DataSource | undefined,
		@InjectModel(Epc.name) private readonly epcModel: EpcModel,
		@InjectQueue(POST_DATA_QUEUE) private readonly postDataQueue: Queue,
		private readonly i18nService: I18nService,
		private readonly rfidRepository: FPIRespository
	) {}

	public async addPostDataQueueJob(tenantId: string, data: PostReaderDataDTO) {
		return await this.postDataQueue.add(tenantId, data, { lifo: true })
	}

	/**
	 * @description Cleanup the queue by tenant. All existing jobs around 5 minutes old will be removed
	 */
	public async cleanupQueue(): Promise<unknown[]> {
		const GRACE_TIME = 60 * 1000 * 5
		const QUANTITY = 1000
		return await Promise.all([
			this.postDataQueue.drain(),
			this.postDataQueue.clean(GRACE_TIME, QUANTITY, 'active'),
			this.postDataQueue.clean(GRACE_TIME, QUANTITY, 'paused'),
			this.postDataQueue.clean(GRACE_TIME, QUANTITY, 'failed'),
			this.postDataQueue.clean(GRACE_TIME, QUANTITY, 'completed')
		])
	}

	public async fetchLatestData(args: RFIDSearchParams) {
		const [epcs, orders] = await Promise.all([this.getIncomingEpcs(args), this.getOrderDetails()])
		return { epcs, orders }
	}

	public async getIncomingEpcs(args: RFIDSearchParams) {
		const factoryCode = this.request.headers['x-user-company']
		const filterQuery: FilterQuery<EpcDocument> = {
			scannable: true,
			station_no: { $regex: new RegExp(`CUS_${factoryCode}_WH10[12]`) },
			mo_no: args['mo_no.eq']
		}
		if (!args['mo_no.eq']) delete filterQuery.mo_no

		return await this.epcModel.paginate(filterQuery, {
			sort: { record_time: -1, epc: 1, mo_no: 1 },
			select: ['epc', 'mo_no'],
			lean: true,
			page: args._page,
			limit: args._limit,
			options: { readPreference: 'nearest' },
			customLabels: { docs: 'data' }
		})
	}

	public async getOrderDetails() {
		const factoryCode = this.request.headers['x-user-company']
		const accumulatedData = await this.epcModel.find(
			{ scannable: true, station_no: { $regex: new RegExp(`CUS_${factoryCode}_WH10[12]`) } },
			null,
			{ readPreference: 'nearest', lean: true }
		)
		if (!Array.isArray(accumulatedData)) throw new Error('Invalid data format')
		return Object.entries(
			groupBy(accumulatedData, (item) => {
				return [item.mo_no, item.mat_ecolor, item.shoes_style_code_factory]
			})
		).map(([keys, sizes]) => {
			const [mo_no, mat_ecolor, shoes_style_code_factory] = keys.split(',')
			return {
				mo_no,
				mat_ecolor,
				shoes_style_code_factory,
				sizes: Object.entries(groupBy(sizes, 'size_numcode')).map(([size, items]) => ({
					size_numcode: size,
					count: items.length
				}))
			}
		})
	}

	public captureDataChange(onSnapshot: (change?: any) => unknown): ReturnType<typeof this.epcModel.watch> {
		const listener = this.epcModel.watch(
			[
				{
					$match: {
						operationType: {
							$in: ['insert', 'update', 'delete']
						}
					}
				}
			],
			{
				fullDocument: 'updateLookup',
				readPreference: 'nearest'
			}
		)

		listener.on('change', onSnapshot)

		return listener
	}

	public async upsertFPStock(orderCode: string, data: UpsertStockDTO) {
		const payload = await this.epcModel.find({ scannable: true, mo_no: orderCode }).lean(true)
		const queryRunner = this.dataSource.createQueryRunner()
		const session = await this.epcModel.startSession()
		await Promise.all([queryRunner.startTransaction(), session.startTransaction()])

		try {
			for (const item of chunk(
				payload.map((value) => ({
					...value,
					...data,
					record_time: format(value.record_time, 'yyyy-MM-dd HH:mm:ss')
				})),
				100
			)) {
				const values = item
					.map((value) => {
						return `(
							'${value.epc}', '${value.mo_no}', '${value.rfid_status}', '${value.rfid_use}', '${value.record_time}', '${value.station_no}',
							'${value.quantity}', '${value.storage}', '${value.factory_code}', '${value.dept_code}', '${value.dept_name}'
						)`
					})
					.join(',')

				await this.dataSource.query(this.upsertInventoryQuery.replace(':values', values))
			}
			await this.epcModel.delete({ mo_no: orderCode }).exec()
			await Promise.all([queryRunner.commitTransaction(), session.commitTransaction()])
		} catch (e) {
			await Promise.all([queryRunner.rollbackTransaction(), session.abortTransaction()])
			throw new InternalServerErrorException(e)
		}
	}

	public async searchCustomerOrder(params: SearchCustOrderParamsDTO) {
		// const queryRunner = this.dataSource.createQueryRunner()

		return await this.dataSource.query(
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

	// TODO: Implement update from stored JSON data file and dv_rfidmatchmst_cust table
	public async exchangeEpcByCommandNumber(payload: ExchangeOrderDTO) {
		const queryRunner = this.dataSource.createQueryRunner()
		const session = await this.epcModel.startSession()
		const epcToExchange = await this.epcModel.aggregate<StoredRFIDReaderItem>([
			{
				$match: {
					deleted: false,
					scannable: true,
					mo_no: { $in: payload.mo_no.split(',').map((m) => m.trim()) },
					mat_ecode: payload.mat_ecolor,
					shoes_style_code_factory: payload.shoes_style_code_factory
				}
			},
			{ $project: { epc: 1 } }
		])
		if (epcToExchange.length === 0) {
			throw new NotFoundException(
				this.i18nService.t('rfid.errors.no_matching_epc', { lang: I18nContext.current().lang })
			)
		}
		try {
			const update = pick(payload, 'mo_no_actual')
			await Promise.all([session.startTransaction(), queryRunner.startTransaction('READ UNCOMMITTED')])
			for (const epcBatch of chunk(
				epcToExchange.map((item) => item.epc),
				2000
			)) {
				const criteria: FindOptionsWhere<RFIDMatchCustomerEntity> = {
					epc: In(epcBatch)
				}
				await queryRunner.manager.update(RFIDMatchCustomerEntity, criteria, update)
			}
			await this.epcModel.updateMany(
				{ epc: { $in: epcToExchange.map((item) => item.epc) } },
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

	public async deleteScannedEpcs(filters: DeleteScannedEpcDTO) {
		const filterQuery: RootFilterQuery<Epc> = !filters['size_numcode.eq'] ? pick(filters, 'mo_no.eq') : filters
		if (filterQuery['size_numcode.eq'] && filterQuery['quantity.eq']) {
			const epcsToDelete = await this.epcModel
				.find({
					mo_no: filters['mo_no.eq'],
					size_numcode: filters['size_numcode.eq']
				})
				.limit(filters['quantity.eq'])
				.lean(true)

			return await this.epcModel
				.updateMany(
					{
						epc: { $in: epcsToDelete.map((item) => item.epc) }
					},
					{ deleted: true, scannable: !filters['f'] },
					{ new: true }
				)
				.exec()
		}
		return await this.epcModel
			.updateMany({ mo_no: filters['mo_no.eq'] }, { deleted: true, scannable: !filters['f'] })
			.exec()
	}

	public async exchangeEpcBySize(update: ExchangeEpcDTO) {
		const factoryCode = this.request.headers['x-user-company'] as string
		const tenantId = this.request.headers['x-tenant-id'] as string
		const epcToExchange = await this.epcModel
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
		return await this.rfidRepository.upsertBulk(tenantId, payload)
	}
}
