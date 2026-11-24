import { DefectiveGoodsStockReportHandler } from '@modules/defective-goods/application/events/defective-goods-stock-report.handler'
import {
	CombinationStrategy,
	DefectiveCategory,
	DefectiveGoodsOutboundPurpose,
	DefectiveGoodsSource,
	DefectiveGoodsUnit,
	DefectiveLocation
} from '@modules/defective-goods/domain/constants'
import {
	DefectiveGoodsDomainModel,
	IDefectiveGoodsProps
} from '@modules/defective-goods/domain/models/defective-goods.model'
import { Connection, createConnection, Schema, Types } from 'mongoose'
import { randomUUID } from 'node:crypto'
import { DefectiveGoodsMongoStockUnitOfWork } from './defective-goods-stock-unit-of-work'
import { DefectiveGoodsReportRepository } from './repositories/defective-goods-report.repository'
import { DefectiveGoodsRepository } from './repositories/defective-goods.repository'
import {
	DefectiveGoodsDailyReport,
	DefectiveGoodsDailyReportModel,
	DefectiveGoodsDailyReportSchema
} from './schemas/defective-goods-daily-report.schema'
import { DefectiveGoods, DefectiveGoodsModel, DefectiveGoodsSchema } from './schemas/defective-goods.schema'

const localMongo = process.env.DEFECTIVE_GOODS_MONGO_TEST === '1' ? describe : describe.skip

localMongo('stock transactions with a secondary-preferred connection', () => {
	let connection: Connection
	let goods: DefectiveGoodsRepository
	let reports: DefectiveGoodsReportRepository
	let unitOfWork: DefectiveGoodsMongoStockUnitOfWork
	const userId = new Types.ObjectId()

	beforeAll(async () => {
		connection = await createConnection('mongodb://127.0.0.1:27017', {
			dbName: `wms_stock_transaction_test_${randomUUID().replaceAll('-', '')}`,
			readPreference: 'secondaryPreferred'
		}).asPromise()
		connection.model('User', new Schema({}, { strict: false }))
		connection.model('Department', new Schema({}, { strict: false }))
		const goodsModel = connection.model<DefectiveGoods, DefectiveGoodsModel>(
			DefectiveGoods.name,
			DefectiveGoodsSchema
		)
		const reportModel = connection.model<DefectiveGoodsDailyReport, DefectiveGoodsDailyReportModel>(
			DefectiveGoodsDailyReport.name,
			DefectiveGoodsDailyReportSchema
		)
		await reportModel.createIndexes()
		goods = new DefectiveGoodsRepository(goodsModel)
		reports = new DefectiveGoodsReportRepository(goodsModel, reportModel)
		unitOfWork = new DefectiveGoodsMongoStockUnitOfWork(connection, goods, reports)
	})

	afterAll(async () => {
		if (connection) {
			await connection.dropDatabase()
			await connection.close()
		}
	})

	it.each(['inbound', 'outbound'] as const)('persists %s stock and reports on the primary', async (flow) => {
		const item = new DefectiveGoodsDomainModel({
			_id: new Types.ObjectId(),
			epc: randomUUID(),
			combination_strategy: CombinationStrategy.MANUALLY,
			defective_category: DefectiveCategory.B_GRADE,
			brand_name: 'BRAND',
			cust_shoes_style: 'CUSTOMER',
			factory_shoes_style: 'FACTORY',
			color_sn: 'BLACK',
			size_numcode: '40',
			unit: DefectiveGoodsUnit.PRS,
			defective_location: DefectiveLocation.ALL,
			shoe_source: DefectiveGoodsSource.FINAL_INSPECTION,
			defective_description: 'defect',
			created_by: userId,
			...(flow === 'outbound' ? { inbound_at: new Date(), storage_location: 'A1' } : {})
		})
		await connection
			.collection<IDefectiveGoodsProps>('defective_goods')
			.insertOne({ ...item.toProps(), deleted: false }, { writeConcern: { w: 'majority' } })
		if (flow === 'inbound') item.stockIn('A1', userId)
		else item.stockOut(DefectiveGoodsOutboundPurpose.LAB, null, userId)
		const reportHandler = new DefectiveGoodsStockReportHandler()

		await unitOfWork.execute(async (transaction) => {
			if (flow === 'inbound') await transaction.stockIn([item])
			else await transaction.stockOut([item])
			await reportHandler.handle([item], transaction)
		})

		const saved = await connection
			.collection('defective_goods')
			.findOne({ epc: item.epc }, { readPreference: 'primary' })
		expect(saved[flow === 'inbound' ? 'inbound_at' : 'outbound_at']).toBeInstanceOf(Date)
		const report = await connection
			.collection('defective_goods_daily_report')
			.findOne({ type: flow }, { readPreference: 'primary' })
		expect(report.size_ledger).toEqual([{ size_numcode: '40', qty: 1 }])
	})
})
