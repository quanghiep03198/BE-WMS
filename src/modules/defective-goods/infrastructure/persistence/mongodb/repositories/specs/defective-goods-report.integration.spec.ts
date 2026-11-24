import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { StockInDefectiveGoodsCommand } from '@modules/defective-goods/application/commands/stock-in/stock-in.command'
import { StockInDefectiveGoodsHandler } from '@modules/defective-goods/application/commands/stock-in/stock-in.handler'
import { StockOutDefectiveGoodsCommand } from '@modules/defective-goods/application/commands/stock-out/stock-out.command'
import { StockOutDefectiveGoodsHandler } from '@modules/defective-goods/application/commands/stock-out/stock-out.handler'
import { DefectiveGoodsStockReportHandler } from '@modules/defective-goods/application/events/defective-goods-stock-report.handler'
import { DEFECTIVE_GOODS_REPORT_REPOSITORY } from '@modules/defective-goods/application/ports/defective-goods-report.repository.port'
import { DEFECTIVE_GOODS_STOCK_UNIT_OF_WORK } from '@modules/defective-goods/application/ports/defective-goods-stock-unit-of-work.port'
import { DEFECTIVE_GOODS_REPOSITORY } from '@modules/defective-goods/application/ports/defective-goods.repository.port'
import {
	CombinationStrategy,
	DefectiveCategory,
	DefectiveGoodsOutboundPurpose,
	DefectiveGoodsSource,
	DefectiveGoodsUnit,
	DefectiveLocation
} from '@modules/defective-goods/domain/constants'
import {
	DefectiveGoodsStockedInEvent,
	DefectiveGoodsStockedOutEvent
} from '@modules/defective-goods/domain/events/defective-goods.events'
import { NoDefectiveGoodsToStockInException } from '@modules/defective-goods/domain/exceptions'
import {
	DefectiveGoodsDomainModel,
	IDefectiveGoodsProps
} from '@modules/defective-goods/domain/models/defective-goods.model'
import { EventPublisher } from '@nestjs/cqrs'
import { getConnectionToken } from '@nestjs/mongoose'
import { Test } from '@nestjs/testing'
import { ClientSession, Connection, createConnection, Schema, Types } from 'mongoose'
import { randomUUID } from 'node:crypto'
import { DefectiveGoodsMongoStockUnitOfWork } from '../../defective-goods-stock-unit-of-work'
import {
	DefectiveGoodsDailyReport,
	DefectiveGoodsDailyReportModel,
	DefectiveGoodsDailyReportSchema
} from '../../schemas/defective-goods-daily-report.schema'
import { DefectiveGoods, DefectiveGoodsModel, DefectiveGoodsSchema } from '../../schemas/defective-goods.schema'
import { defectiveGoodsDailyReportPipeline } from '../defective-goods-report.pipeline'
import { DefectiveGoodsReportRepository } from '../defective-goods-report.repository'
import { DefectiveGoodsRepository } from '../defective-goods.repository'

const localMongo = process.env.DEFECTIVE_GOODS_MONGO_TEST === '1' ? describe : describe.skip

localMongo('daily stock reports with local MongoDB', () => {
	let connection: Connection
	let repository: DefectiveGoodsReportRepository
	let goodsModel: DefectiveGoodsModel
	const userId = new Types.ObjectId()

	const createGoods = (size: string): DefectiveGoodsDomainModel =>
		new DefectiveGoodsDomainModel({
			_id: new Types.ObjectId(),
			epc: randomUUID(),
			combination_strategy: CombinationStrategy.MANUALLY,
			defective_category: DefectiveCategory.B_GRADE,
			brand_name: 'BRAND',
			cust_shoes_style: 'CUSTOMER',
			factory_shoes_style: 'FACTORY',
			color_sn: 'BLACK',
			size_numcode: size,
			unit: DefectiveGoodsUnit.PRS,
			defective_location: DefectiveLocation.ALL,
			shoe_source: DefectiveGoodsSource.FINAL_INSPECTION,
			defective_description: 'defect',
			created_by: userId
		} satisfies IDefectiveGoodsProps)

	beforeAll(async () => {
		const database = `wms_defective_report_test_${randomUUID().replace(/-/g, '')}`
		connection = await createConnection('mongodb://127.0.0.1:27017', { dbName: database }).asPromise()
		connection.model('User', new Schema({}, { strict: false }))
		connection.model('Department', new Schema({}, { strict: false }))
		goodsModel = connection.model<DefectiveGoods, DefectiveGoodsModel>(DefectiveGoods.name, DefectiveGoodsSchema)
		const reports = connection.model<DefectiveGoodsDailyReport, DefectiveGoodsDailyReportModel>(
			DefectiveGoodsDailyReport.name,
			DefectiveGoodsDailyReportSchema
		)
		await reports.createIndexes()
		repository = new DefectiveGoodsReportRepository(goodsModel, reports)
	})

	afterAll(async () => {
		if (connection) {
			await connection.dropDatabase()
			await connection.close()
		}
	})

	it.each(['inbound', 'outbound'] as const)(
		'finds pending %s EPCs by manual selection or virtual filters',
		async (flow) => {
			const valid = [createGoods('40'), createGoods('40')]
			const otherBrand = createGoods('40')
			const wrongState = createGoods('40')
			const deleted = createGoods('40')
			const inStock = flow === 'outbound' ? { inbound_at: new Date(), storage_location: 'A1' } : {}
			const notPending = flow === 'outbound' ? {} : { inbound_at: new Date(), storage_location: 'A1' }
			const brand = `PENDING-${flow}`
			const source = connection.collection<IDefectiveGoodsProps>('defective_goods')
			await source.insertMany(
				[
					...valid.map((item) => ({ ...item.toProps(), ...inStock, brand_name: brand, deleted: false })),
					{ ...otherBrand.toProps(), ...inStock, brand_name: 'OTHER', deleted: false },
					{ ...wrongState.toProps(), ...notPending, brand_name: brand, deleted: false },
					{ ...deleted.toProps(), ...inStock, brand_name: brand, deleted: true }
				],
				{ writeConcern: { w: 'majority' } }
			)
			const repository = new DefectiveGoodsRepository(goodsModel)
			const find =
				flow === 'inbound'
					? repository.findPendingStockIn.bind(repository)
					: repository.findPendingStockOut.bind(repository)

			const manual = await find(
				{ brand_name: 'IGNORED', combination_strategy: CombinationStrategy.MANUALLY },
				[...valid.map((item) => item.epc), wrongState.epc, deleted.epc],
				1
			)
			expect(manual.map((item) => item.epc).sort()).toEqual(valid.map((item) => item.epc).sort())
			expect(manual.every((item) => item instanceof DefectiveGoodsDomainModel)).toBe(true)

			const virtual = await find(
				{ brand_name: brand, size_numcode: '40', combination_strategy: CombinationStrategy.UHF },
				['ignored-epc'],
				1
			)
			expect(virtual).toHaveLength(1)
			expect(valid.map((item) => item.epc)).toContain(virtual[0].epc)
		}
	)

	it('resolves both stock commands with the MongoDB unit-of-work provider', async () => {
		const module = await Test.createTestingModule({
			providers: [
				StockInDefectiveGoodsHandler,
				StockOutDefectiveGoodsHandler,
				DefectiveGoodsStockReportHandler,
				{ provide: DEFECTIVE_GOODS_STOCK_UNIT_OF_WORK, useClass: DefectiveGoodsMongoStockUnitOfWork },
				{ provide: DEFECTIVE_GOODS_REPOSITORY, useValue: new DefectiveGoodsRepository(goodsModel) },
				{ provide: DEFECTIVE_GOODS_REPORT_REPOSITORY, useValue: repository },
				{ provide: getConnectionToken(DATA_WAREHOUSE_CONNECTION), useValue: connection },
				{ provide: EventPublisher, useValue: { mergeObjectContext: (model: DefectiveGoodsDomainModel) => model } }
			]
		}).compile()
		try {
			expect(module.get(StockInDefectiveGoodsHandler)).toBeInstanceOf(StockInDefectiveGoodsHandler)
			expect(module.get(StockOutDefectiveGoodsHandler)).toBeInstanceOf(StockOutDefectiveGoodsHandler)
			expect(module.get(DEFECTIVE_GOODS_STOCK_UNIT_OF_WORK)).toBeInstanceOf(DefectiveGoodsMongoStockUnitOfWork)
		} finally {
			await module.close()
		}
	})

	it('merges repeated transactions and keeps inbound and outbound separate', async () => {
		const goods = [createGoods('40'), createGoods('40'), createGoods('41')]
		goods.forEach((item) => item.stockIn('A1', userId))
		const session = await connection.startSession()
		try {
			await session.withTransaction(
				async () => {
					await repository.mergeStockEvents(
						goods.flatMap((item) =>
							item
								.getUncommittedEvents()
								.filter(
									(event): event is DefectiveGoodsStockedInEvent =>
										event instanceof DefectiveGoodsStockedInEvent
								)
						),
						session
					)
				},
				{ writeConcern: { w: 'majority' } }
			)
			goods[0].stockOut(DefectiveGoodsOutboundPurpose.LAB, null, userId)
			await session.withTransaction(
				async () => {
					await repository.mergeStockEvents(
						goods[0]
							.getUncommittedEvents()
							.filter(
								(event): event is DefectiveGoodsStockedOutEvent =>
									event instanceof DefectiveGoodsStockedOutEvent
							),
						session
					)
				},
				{ writeConcern: { w: 'majority' } }
			)
		} finally {
			await session.endSession()
		}
		const inbound = await repository.getDailyInboundReport(new Date())
		const outbound = await repository.getDailyOutboundReport(new Date())
		expect(inbound).toHaveLength(1)
		expect(inbound[0].size_ledger).toEqual(
			expect.arrayContaining([
				{ size_numcode: '40', qty: 2 },
				{ size_numcode: '41', qty: 1 }
			])
		)
		expect(inbound[0].total_qty).toBe(3)
		expect(outbound).toHaveLength(1)
		expect(outbound[0].size_ledger).toEqual([{ size_numcode: '40', qty: 1 }])
		expect(outbound[0].outbound_purpose).toBe(DefectiveGoodsOutboundPurpose.LAB)
	})

	it('rolls back report writes when the surrounding transaction fails', async () => {
		const item = createGoods('42')
		item.stockIn('B1', userId)
		const session = await connection.startSession()
		try {
			await expect(
				session.withTransaction(async () => {
					await repository.mergeStockEvents(
						item
							.getUncommittedEvents()
							.filter(
								(event): event is DefectiveGoodsStockedInEvent => event instanceof DefectiveGoodsStockedInEvent
							),
						session
					)
					throw new Error('transaction failed')
				})
			).rejects.toThrow('transaction failed')
		} finally {
			await session.endSession()
		}
		const reports = await repository.getDailyInboundReport(new Date())
		expect(reports.some((report) => report.storage_location === 'B1')).toBe(false)
	})

	it('rolls back the stock update if writing the report fails', async () => {
		const item = createGoods('43')
		const collection = connection.collection('test_stock_updates')
		await collection.insertOne({ epc: item.epc, stocked: false })
		const goodsRepository = {
			findPendingStockIn: async () => [item],
			stockIn: async (_models: DefectiveGoodsDomainModel[], session: ClientSession) => {
				if (!session) throw new Error('stock update must use a transaction')
				await collection.updateOne({ epc: item.epc }, { $set: { stocked: true } }, { session })
			}
		}
		const publisher = { mergeObjectContext: (model: DefectiveGoodsDomainModel) => model }
		const failingReports = {
			mergeStockEvents: async () => {
				throw new Error('report write failed')
			}
		}
		const unitOfWork: DefectiveGoodsMongoStockUnitOfWork = Reflect.construct(DefectiveGoodsMongoStockUnitOfWork, [
			connection,
			goodsRepository,
			failingReports
		])
		const handler: StockInDefectiveGoodsHandler = Reflect.construct(StockInDefectiveGoodsHandler, [
			goodsRepository,
			publisher,
			unitOfWork,
			new DefectiveGoodsStockReportHandler()
		])

		await expect(
			handler.execute(
				new StockInDefectiveGoodsCommand(
					{ combination_strategy: CombinationStrategy.MANUALLY, epcs: [item.epc], storage_location: 'A1' },
					userId,
					{},
					0
				)
			)
		).rejects.toThrow('report write failed')
		expect((await collection.findOne({ epc: item.epc }))?.stocked).toBe(false)
	})

	it('rolls back stock-out and does not publish events if the report fails', async () => {
		const item = createGoods('43-out')
		item.stockIn('A1', userId)
		item.commit()
		const commit = jest.spyOn(item, 'commit')
		const collection = connection.collection('test_stock_updates')
		await collection.insertOne({ epc: item.epc, stocked: true }, { writeConcern: { w: 'majority' } })
		const goodsRepository = {
			findPendingStockOut: async () => [item],
			stockOut: async (_models: DefectiveGoodsDomainModel[], session: ClientSession) => {
				await collection.updateOne({ epc: item.epc }, { $set: { stocked: false } }, { session })
			}
		}
		const failingReports = {
			mergeStockEvents: async () => {
				throw new Error('report write failed')
			}
		}
		const unitOfWork: DefectiveGoodsMongoStockUnitOfWork = Reflect.construct(DefectiveGoodsMongoStockUnitOfWork, [
			connection,
			goodsRepository,
			failingReports
		])
		const handler: StockOutDefectiveGoodsHandler = Reflect.construct(StockOutDefectiveGoodsHandler, [
			goodsRepository,
			{ mergeObjectContext: (model: DefectiveGoodsDomainModel) => model },
			unitOfWork,
			new DefectiveGoodsStockReportHandler()
		])

		await expect(
			handler.execute(
				new StockOutDefectiveGoodsCommand(
					{
						combination_strategy: CombinationStrategy.MANUALLY,
						epcs: [item.epc],
						outbound_purpose: DefectiveGoodsOutboundPurpose.LAB
					},
					userId,
					{},
					0
				)
			)
		).rejects.toThrow('report write failed')
		expect((await collection.findOne({ epc: item.epc }))?.stocked).toBe(true)
		expect(commit).not.toHaveBeenCalled()
	})

	it('writes inbound and outbound reports when the corresponding commands succeed', async () => {
		const item = createGoods('$43')
		const collection = connection.collection('test_stock_updates')
		await collection.insertOne({ epc: item.epc, stocked: false }, { writeConcern: { w: 'majority' } })
		const goodsRepository = {
			findPendingStockIn: async () => [item],
			findPendingStockOut: async () => [item],
			stockIn: async (_models: DefectiveGoodsDomainModel[], session: ClientSession) => {
				await collection.updateOne({ epc: item.epc }, { $set: { stocked: true } }, { session })
			},
			stockOut: async (_models: DefectiveGoodsDomainModel[], session: ClientSession) => {
				await collection.updateOne({ epc: item.epc }, { $set: { stocked: false } }, { session })
			}
		}
		const publisher = { mergeObjectContext: (model: DefectiveGoodsDomainModel) => model }
		const reports = new DefectiveGoodsStockReportHandler()
		const unitOfWork: DefectiveGoodsMongoStockUnitOfWork = Reflect.construct(DefectiveGoodsMongoStockUnitOfWork, [
			connection,
			goodsRepository,
			repository
		])
		const stockIn: StockInDefectiveGoodsHandler = Reflect.construct(StockInDefectiveGoodsHandler, [
			goodsRepository,
			publisher,
			unitOfWork,
			reports
		])
		const stockOut: StockOutDefectiveGoodsHandler = Reflect.construct(StockOutDefectiveGoodsHandler, [
			goodsRepository,
			publisher,
			unitOfWork,
			reports
		])
		await stockIn.execute(
			new StockInDefectiveGoodsCommand(
				{ combination_strategy: CombinationStrategy.MANUALLY, epcs: [item.epc], storage_location: 'C1' },
				userId,
				{},
				0
			)
		)
		await stockOut.execute(
			new StockOutDefectiveGoodsCommand(
				{
					combination_strategy: CombinationStrategy.MANUALLY,
					epcs: [item.epc],
					outbound_purpose: DefectiveGoodsOutboundPurpose.LAB
				},
				userId,
				{},
				0
			)
		)
		expect(
			(await repository.getDailyInboundReport(new Date())).find((row) => row.storage_location === 'C1')?.size_ledger
		).toEqual([{ size_numcode: '$43', qty: 1 }])
		expect(
			(await repository.getDailyOutboundReport(new Date())).find((row) =>
				row.size_ledger.some((size) => size.size_numcode === '$43')
			)?.size_ledger
		).toEqual(expect.arrayContaining([{ size_numcode: '$43', qty: 1 }]))
		expect((await collection.findOne({ epc: item.epc }))?.stocked).toBe(false)
	})

	it('persists stock changes and reports together with the MongoDB repository', async () => {
		const item = createGoods('47')
		const source = connection.collection<IDefectiveGoodsProps>('defective_goods')
		await source.insertOne(
			{ ...item.toProps(), deleted: false, updated_at: new Date() },
			{ writeConcern: { w: 'majority' } }
		)
		const goodsRepository = new DefectiveGoodsRepository(goodsModel)
		const publisher = { mergeObjectContext: (model: DefectiveGoodsDomainModel) => model }
		const reports = new DefectiveGoodsStockReportHandler()
		const unitOfWork = new DefectiveGoodsMongoStockUnitOfWork(connection, goodsRepository, repository)
		const stockIn: StockInDefectiveGoodsHandler = Reflect.construct(StockInDefectiveGoodsHandler, [
			goodsRepository,
			publisher,
			unitOfWork,
			reports
		])
		const stockOut: StockOutDefectiveGoodsHandler = Reflect.construct(StockOutDefectiveGoodsHandler, [
			goodsRepository,
			publisher,
			unitOfWork,
			reports
		])
		await stockIn.execute(
			new StockInDefectiveGoodsCommand(
				{ combination_strategy: CombinationStrategy.MANUALLY, epcs: [item.epc], storage_location: 'F1' },
				userId,
				{},
				0
			)
		)
		expect((await source.findOne({ epc: item.epc }))?.inbound_at).toBeInstanceOf(Date)
		expect(
			(await repository.getDailyInboundReport(new Date())).find((row) => row.storage_location === 'F1')?.total_qty
		).toBe(1)
		await stockOut.execute(
			new StockOutDefectiveGoodsCommand(
				{
					combination_strategy: CombinationStrategy.MANUALLY,
					epcs: [item.epc],
					outbound_purpose: DefectiveGoodsOutboundPurpose.RUIN
				},
				userId,
				{},
				0
			)
		)
		const stored = await source.findOne({ epc: item.epc })
		expect(stored?.outbound_at).toBeInstanceOf(Date)
		expect(stored?.defective_category).toBe(DefectiveCategory.C_GRADE)
		expect(
			(await repository.getDailyOutboundReport(new Date())).find(
				(row) => row.outbound_purpose === DefectiveGoodsOutboundPurpose.RUIN
			)?.size_ledger
		).toEqual([{ size_numcode: '47', qty: 1 }])
	})

	it('does not count a repeated stock-in command twice', async () => {
		const item = createGoods('52')
		const source = connection.collection<IDefectiveGoodsProps>('defective_goods')
		await source.insertOne(
			{ ...item.toProps(), deleted: false, updated_at: new Date() },
			{ writeConcern: { w: 'majority' } }
		)
		const goodsRepository = new DefectiveGoodsRepository(goodsModel)
		const stockIn: StockInDefectiveGoodsHandler = Reflect.construct(StockInDefectiveGoodsHandler, [
			goodsRepository,
			{ mergeObjectContext: (model: DefectiveGoodsDomainModel) => model },
			new DefectiveGoodsMongoStockUnitOfWork(connection, goodsRepository, repository),
			new DefectiveGoodsStockReportHandler()
		])
		const command = new StockInDefectiveGoodsCommand(
			{ combination_strategy: CombinationStrategy.MANUALLY, epcs: [item.epc], storage_location: 'K1' },
			userId,
			{},
			0
		)
		await stockIn.execute(command)
		await expect(stockIn.execute(command)).rejects.toThrow(NoDefectiveGoodsToStockInException)
		const report = (await repository.getDailyInboundReport(new Date())).find((row) => row.storage_location === 'K1')
		expect(report?.size_ledger).toEqual([{ size_numcode: '52', qty: 1 }])
	})

	it('counts only one of two concurrent stock-in attempts for the same item', async () => {
		const item = createGoods('53')
		const source = connection.collection<IDefectiveGoodsProps>('defective_goods')
		await source.insertOne(
			{ ...item.toProps(), deleted: false, updated_at: new Date() },
			{ writeConcern: { w: 'majority' } }
		)
		const goodsRepository = new DefectiveGoodsRepository(goodsModel)
		const [first] = await goodsRepository.find({ epc: item.epc })
		const [second] = await goodsRepository.find({ epc: item.epc })
		first.stockIn('L1', userId)
		second.stockIn('L1', userId)
		const reports = new DefectiveGoodsStockReportHandler()
		const unitOfWork = new DefectiveGoodsMongoStockUnitOfWork(connection, goodsRepository, repository)
		const results = await Promise.allSettled(
			[first, second].map((model) =>
				unitOfWork.execute(async (transaction) => {
					await transaction.stockIn([model])
					await reports.handle([model], transaction)
				})
			)
		)
		expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected'])
		const report = (await repository.getDailyInboundReport(new Date())).find((row) => row.storage_location === 'L1')
		expect(report?.size_ledger).toEqual([{ size_numcode: '53', qty: 1 }])
	})

	it('rejects a stale stock-in even if the update timestamp is unchanged', async () => {
		const item = createGoods('55')
		const source = connection.collection<IDefectiveGoodsProps>('defective_goods')
		const updatedAt = new Date('2026-01-01T00:00:00.000Z')
		await source.insertOne(
			{ ...item.toProps(), deleted: false, updated_at: updatedAt },
			{ writeConcern: { w: 'majority' } }
		)
		const goodsRepository = new DefectiveGoodsRepository(goodsModel)
		const [stale] = await goodsRepository.find({ epc: item.epc })
		stale.stockIn('N1', userId)
		await source.updateOne(
			{ epc: item.epc },
			{ $set: { inbound_at: new Date(), storage_location: 'N1', updated_at: updatedAt } },
			{ writeConcern: { w: 'majority' } }
		)
		const session = await connection.startSession()
		try {
			await expect(
				session.withTransaction(() => goodsRepository.stockIn([stale], session), {
					writeConcern: { w: 'majority' }
				})
			).rejects.toThrow('changed before stock in')
		} finally {
			await session.endSession()
		}
		expect((await repository.getDailyInboundReport(new Date())).some((row) => row.storage_location === 'N1')).toBe(
			false
		)
	})

	it('returns department objects for reports containing line IDs', async () => {
		const sewingId = new Types.ObjectId()
		const assemblyId = new Types.ObjectId()
		await connection.collection('departments').insertMany(
			[
				{ _id: sewingId, name: { vi: 'May 1', en: 'Sewing 1' } },
				{ _id: assemblyId, name: { vi: 'Thanh hinh 1', en: 'Assembly 1' } }
			],
			{ writeConcern: { w: 'majority' } }
		)
		const item = createGoods('54')
		const model = new DefectiveGoodsDomainModel({
			...item.toProps(),
			sewing_line: sewingId.toHexString(),
			assembly_line: assemblyId.toHexString()
		})
		model.stockIn('M1', userId)
		const handler = new DefectiveGoodsStockReportHandler()
		const unitOfWork = new DefectiveGoodsMongoStockUnitOfWork(
			connection,
			new DefectiveGoodsRepository(goodsModel),
			repository
		)
		await unitOfWork.execute((transaction) => handler.handle([model], transaction))
		model.commit()
		model.stockOut(DefectiveGoodsOutboundPurpose.SHIPPING, 'PO54', userId)
		await unitOfWork.execute((transaction) => handler.handle([model], transaction))
		const inbound = (await repository.getDailyInboundReport(new Date())).find((row) => row.storage_location === 'M1')
		const outbound = (await repository.getDailyOutboundReport(new Date())).find((row) => row.po === 'PO54')
		for (const report of [inbound, outbound]) {
			expect(report?.sewing_line).toEqual(
				expect.objectContaining({ _id: sewingId, name: { vi: 'May 1', en: 'Sewing 1' } })
			)
			expect(report?.assembly_line).toEqual(
				expect.objectContaining({ _id: assemblyId, name: { vi: 'Thanh hinh 1', en: 'Assembly 1' } })
			)
		}
		const historicalDate = new Date(2035, 0, 5, 12)
		await connection.collection('defective_goods_daily_report').insertOne(
			{
				date: '2035-01-05',
				type: 'inbound',
				sewing_line: sewingId,
				assembly_line: { _id: assemblyId, name: { vi: 'Previous name' } },
				size_ledger: [{ size_numcode: '54', qty: 1 }]
			},
			{ writeConcern: { w: 'majority' } }
		)
		const [historical] = await repository.getDailyInboundReport(historicalDate)
		expect(historical.sewing_line).toEqual(
			expect.objectContaining({ _id: sewingId, name: { vi: 'May 1', en: 'Sewing 1' } })
		)
		expect(historical.assembly_line).toEqual(
			expect.objectContaining({ _id: assemblyId, name: { vi: 'Thanh hinh 1', en: 'Assembly 1' } })
		)
	})

	it('keeps a B_TO_C downgrade in stock without adding an outbound report', async () => {
		const item = createGoods('49')
		const source = connection.collection<IDefectiveGoodsProps>('defective_goods')
		await source.insertOne(
			{ ...item.toProps(), deleted: false, updated_at: new Date(), inbound_at: new Date(), storage_location: 'H1' },
			{ writeConcern: { w: 'majority' } }
		)
		const goodsRepository = new DefectiveGoodsRepository(goodsModel)
		const publisher = { mergeObjectContext: (model: DefectiveGoodsDomainModel) => model }
		const stockOut: StockOutDefectiveGoodsHandler = Reflect.construct(StockOutDefectiveGoodsHandler, [
			goodsRepository,
			publisher,
			new DefectiveGoodsMongoStockUnitOfWork(connection, goodsRepository, repository),
			new DefectiveGoodsStockReportHandler()
		])
		await stockOut.execute(
			new StockOutDefectiveGoodsCommand(
				{
					combination_strategy: CombinationStrategy.MANUALLY,
					epcs: [item.epc],
					outbound_purpose: DefectiveGoodsOutboundPurpose.DOWNGRADE
				},
				userId,
				{},
				0
			)
		)
		const stored = await source.findOne({ epc: item.epc })
		expect(stored?.deleted).toBe(false)
		expect(stored?.defective_category).toBe(DefectiveCategory.C_GRADE)
		expect(
			(await repository.getDailyOutboundReport(new Date())).some((row) =>
				row.size_ledger.some((entry) => entry.size_numcode === '49')
			)
		).toBe(false)
	})

	it('rejects a stale stock update rather than reporting an uncommitted item', async () => {
		const item = createGoods('50')
		const source = connection.collection<IDefectiveGoodsProps>('defective_goods')
		const updatedAt = new Date('2026-01-01T00:00:00.000Z')
		await source.insertOne(
			{ ...item.toProps(), deleted: false, updated_at: updatedAt },
			{ writeConcern: { w: 'majority' } }
		)
		const goodsRepository = new DefectiveGoodsRepository(goodsModel)
		const [stale] = await goodsRepository.find({ epc: item.epc })
		await source.updateOne(
			{ epc: item.epc },
			{ $set: { updated_at: new Date('2026-01-02T00:00:00.000Z') } },
			{ writeConcern: { w: 'majority' } }
		)
		stale.stockIn('I1', userId)
		const session = await connection.startSession()
		try {
			await expect(
				session.withTransaction(() => goodsRepository.stockIn([stale], session), {
					writeConcern: { w: 'majority' }
				})
			).rejects.toThrow('changed before stock in')
		} finally {
			await session.endSession()
		}
		expect((await source.findOne({ epc: item.epc }))?.storage_location).toBeUndefined()
		expect((await repository.getDailyInboundReport(new Date())).some((row) => row.storage_location === 'I1')).toBe(
			false
		)
	})

	it('merges concurrent transactions without losing quantities', async () => {
		const seed = createGoods('45')
		seed.stockIn('D1', userId)
		const merge = async (item: DefectiveGoodsDomainModel) => {
			const session = await connection.startSession()
			try {
				await session.withTransaction(
					() =>
						repository.mergeStockEvents(
							item
								.getUncommittedEvents()
								.filter(
									(event): event is DefectiveGoodsStockedInEvent =>
										event instanceof DefectiveGoodsStockedInEvent
								),
							session
						),
					{ writeConcern: { w: 'majority' } }
				)
			} finally {
				await session.endSession()
			}
		}
		await merge(seed)
		const first = createGoods('45')
		const second = createGoods('45')
		first.stockIn('D1', userId)
		second.stockIn('D1', userId)
		await Promise.all([merge(first), merge(second)])
		const report = (await repository.getDailyInboundReport(new Date())).find((row) => row.storage_location === 'D1')
		expect(report?.size_ledger).toEqual([{ size_numcode: '45', qty: 3 }])
	})

	it('merges concurrent transactions on a previously unseen day', async () => {
		const date = new Date(2032, 1, 5, 12)
		const items = [createGoods('46'), createGoods('46')]
		const sessions = await Promise.all(items.map(() => connection.startSession()))
		try {
			await Promise.all(
				items.map((item, index) => {
					const snapshot = { ...item.toProps(), inbound_at: date, storage_location: 'E1' }
					return sessions[index].withTransaction(
						() =>
							repository.mergeStockEvents(
								[new DefectiveGoodsStockedInEvent([item.id], snapshot)],
								sessions[index]
							),
						{ writeConcern: { w: 'majority' } }
					)
				})
			)
		} finally {
			await Promise.all(sessions.map((session) => session.endSession()))
		}
		const reports = await repository.getDailyInboundReport(date)
		expect(reports).toHaveLength(1)
		expect(reports[0].size_ledger).toEqual([{ size_numcode: '46', qty: 2 }])
	})

	it('rebuilds duplicate legacy reports for the affected day without double-counting the event', async () => {
		const item = createGoods('44')
		const date = new Date('2031-03-04T12:30:00.000Z')
		const snapshot = { ...item.toProps(), inbound_at: date, storage_location: 'Z1', deleted: false }
		await connection
			.collection<IDefectiveGoodsProps>('defective_goods')
			.insertOne(snapshot, { writeConcern: { w: 'majority' } })
		await connection.collection('defective_goods_daily_report').insertMany(
			[
				{
					date: '2031-03-04',
					type: 'inbound',
					brand_name: 'BRAND',
					po: null,
					mo_no: null,
					cust_shoes_style: 'CUSTOMER',
					factory_shoes_style: 'FACTORY',
					color_sn: 'BLACK',
					sewing_line: null,
					assembly_line: null,
					defective_category: DefectiveCategory.B_GRADE,
					shoe_source: DefectiveGoodsSource.FINAL_INSPECTION,
					storage_location: 'Z1',
					size_ledger: [{ size_numcode: '44', qty: 1 }]
				},
				{
					date: '2031-03-04',
					type: 'inbound',
					brand_name: 'BRAND',
					po: null,
					mo_no: null,
					cust_shoes_style: 'CUSTOMER',
					factory_shoes_style: 'FACTORY',
					color_sn: 'BLACK',
					sewing_line: null,
					assembly_line: null,
					defective_category: DefectiveCategory.B_GRADE,
					shoe_source: DefectiveGoodsSource.FINAL_INSPECTION,
					storage_location: 'Z1',
					size_ledger: [{ size_numcode: '44', qty: 1 }]
				}
			],
			{ writeConcern: { w: 'majority' } }
		)
		const session = await connection.startSession()
		try {
			await session.withTransaction(
				async () => {
					await repository.mergeStockEvents([new DefectiveGoodsStockedInEvent([item.id], snapshot)], session)
				},
				{ writeConcern: { w: 'majority' } }
			)
		} finally {
			await session.endSession()
		}
		const reports = await repository.getDailyInboundReport(date)
		expect(reports).toHaveLength(1)
		expect(reports[0].size_ledger).toEqual([{ size_numcode: '44', qty: 1 }])
		expect(
			await connection.collection('defective_goods_daily_report_archive').countDocuments({ date: '2031-03-04' })
		).toBe(2)
		const next = createGoods('44')
		const nextSnapshot = { ...next.toProps(), inbound_at: date, storage_location: 'Z1', deleted: false }
		const nextSession = await connection.startSession()
		try {
			await nextSession.withTransaction(
				() => repository.mergeStockEvents([new DefectiveGoodsStockedInEvent([next.id], nextSnapshot)], nextSession),
				{ writeConcern: { w: 'majority' } }
			)
		} finally {
			await nextSession.endSession()
		}
		const updated = await repository.getDailyInboundReport(date)
		expect(updated).toHaveLength(1)
		expect(updated[0].size_ledger).toEqual([{ size_numcode: '44', qty: 2 }])
	})

	it.each(['inbound', 'outbound'] as const)(
		'uses the same UTC day for migrated, rebuilt and event-driven %s reports',
		async (type) => {
			const source = connection.collection<IDefectiveGoodsProps>('defective_goods')
			const reports = connection.collection('defective_goods_daily_report')
			const first = createGoods(`boundary-${type}`)
			const second = createGoods(`boundary-${type}`)
			const third = createGoods(`boundary-${type}`)
			const snapshot = (item: DefectiveGoodsDomainModel, timestamp: string) => ({
				...item.toProps(),
				inbound_at: new Date(timestamp),
				storage_location: `TZ-${type}`,
				...(type === 'outbound'
					? { outbound_at: new Date(timestamp), outbound_purpose: DefectiveGoodsOutboundPurpose.LAB }
					: {})
			})
			const initial = snapshot(first, '2037-01-04T17:10:00.000Z')
			await source.insertOne(initial, { writeConcern: { w: 'majority' } })
			const [legacy] = await goodsModel.aggregateWithDeleted([
				...defectiveGoodsDailyReportPipeline(type),
				{ $match: { date: '2037-01-04', 'size_ledger.size_numcode': `boundary-${type}` } }
			])
			expect(legacy.date).toBe('2037-01-04')
			await reports.insertOne({ ...legacy, type }, { writeConcern: { w: 'majority' } })

			const merge = async (item: DefectiveGoodsDomainModel, data: ReturnType<typeof snapshot>) => {
				await source.insertOne(data, { writeConcern: { w: 'majority' } })
				const event =
					type === 'inbound'
						? new DefectiveGoodsStockedInEvent([item.id], data)
						: new DefectiveGoodsStockedOutEvent([item.id], data)
				const session = await connection.startSession()
				try {
					await session.withTransaction(() => repository.mergeStockEvents([event], session), {
						writeConcern: { w: 'majority' }
					})
				} finally {
					await session.endSession()
				}
			}
			await merge(second, snapshot(second, '2037-01-04T17:30:00.000Z'))
			await merge(third, snapshot(third, '2037-01-05T00:30:00.000Z'))

			const read = (date: Date) =>
				type === 'inbound' ? repository.getDailyInboundReport(date) : repository.getDailyOutboundReport(date)
			const previousDay = await read(new Date('2037-01-04T00:00:00.000Z'))
			const nextDay = await read(new Date('2037-01-05T00:00:00.000Z'))
			expect(previousDay).toHaveLength(1)
			expect(previousDay[0].size_ledger).toEqual([{ size_numcode: `boundary-${type}`, qty: 2 }])
			expect(nextDay).toHaveLength(1)
			expect(nextDay[0].size_ledger).toEqual([{ size_numcode: `boundary-${type}`, qty: 1 }])
			expect(
				await connection.collection('defective_goods_daily_report_archive').countDocuments({
					date: '2037-01-04',
					type
				})
			).toBe(1)
		}
	)

	it('preserves legacy reports if their source records cannot be rebuilt', async () => {
		const item = createGoods('48')
		const date = new Date(2033, 0, 5, 12)
		const legacy = { date: '2033-01-05', type: 'inbound', size_ledger: [{ size_numcode: '48', qty: 3 }] }
		await connection.collection('defective_goods_daily_report').insertOne(legacy, { writeConcern: { w: 'majority' } })
		const session = await connection.startSession()
		try {
			await expect(
				session.withTransaction(
					() =>
						repository.mergeStockEvents(
							[
								new DefectiveGoodsStockedInEvent([item.id], {
									...item.toProps(),
									inbound_at: date,
									storage_location: 'G1'
								})
							],
							session
						),
					{ writeConcern: { w: 'majority' } }
				)
			).rejects.toThrow('no source data')
		} finally {
			await session.endSession()
		}
		expect(await connection.collection('defective_goods_daily_report').countDocuments({ date: legacy.date })).toBe(1)
	})

	it('preserves legacy reports when source records no longer cover their quantities', async () => {
		const item = createGoods('51')
		const date = new Date(2034, 0, 5, 12)
		const snapshot = { ...item.toProps(), inbound_at: date, storage_location: 'J1', deleted: false }
		await connection.collection<IDefectiveGoodsProps>('defective_goods').insertOne(snapshot, {
			writeConcern: { w: 'majority' }
		})
		const legacy = {
			date: '2034-01-05',
			type: 'inbound',
			brand_name: 'BRAND',
			po: null,
			mo_no: null,
			cust_shoes_style: 'CUSTOMER',
			factory_shoes_style: 'FACTORY',
			color_sn: 'BLACK',
			sewing_line: null,
			assembly_line: null,
			defective_category: DefectiveCategory.B_GRADE,
			shoe_source: DefectiveGoodsSource.FINAL_INSPECTION,
			storage_location: 'J1',
			size_ledger: [{ size_numcode: '51', qty: 3 }]
		}
		await connection.collection('defective_goods_daily_report').insertOne(legacy, { writeConcern: { w: 'majority' } })
		const session = await connection.startSession()
		try {
			await expect(
				session.withTransaction(
					() => repository.mergeStockEvents([new DefectiveGoodsStockedInEvent([item.id], snapshot)], session),
					{ writeConcern: { w: 'majority' } }
				)
			).rejects.toThrow('source data does not cover the previous report')
		} finally {
			await session.endSession()
		}
		const saved = await connection.collection('defective_goods_daily_report').findOne({ date: legacy.date })
		expect(saved?.size_ledger).toEqual([{ size_numcode: '51', qty: 3 }])
	})
})
