import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { FinishedGoodsEpcStatus } from '@modules/finished-goods/domain/constants'
import { StockTransactionNotRollbackableException } from '@modules/finished-goods/domain/exceptions/stock-transaction-not-rollbackable.exception'
import { ElectronicProductCode } from '@modules/finished-goods/domain/value-objects/epc.vo'
import { SizeNumber } from '@modules/finished-goods/domain/value-objects/size-number.vo'
import { ManufacturingOrder, ManufacturingOrderSchema } from '@modules/order/schemas/manufacturing-order.schema'
import { PurchaseOrder, PurchaseOrderSchema } from '@modules/order/schemas/purchase-order.schema'
import { TransactionHost } from '@nestjs-cls/transactional'
import { TransactionalAdapterMongoose } from '@nestjs-cls/transactional-adapter-mongoose'
import mongoose, { Types } from 'mongoose'
import { randomUUID } from 'node:crypto'
import { DailyMoInventoryLedger, DailyMoInventoryLedgerSchema } from '../schemas/daily-mo-inventory-ledger.schema'
import { DailyPoShippingProgress, DailyPoShippingProgressSchema } from '../schemas/daily-po-shipping-progress.schema'
import { FinishedGoodsEpc, FinishedGoodsEpcSchema } from '../schemas/finished-goods-epc.schema'
import { InventoryLedgerRepository } from './inventory-ledger.repository'
import { ShippingProgressMongoRepository } from './shipping-progress-mongo.repository'
import { StockTransactionMongoRepository } from './stock-transaction-mongo.repository'

const uri = process.env.STOCK_TX_TEST_MONGO_URI
const integration = uri ? describe : describe.skip

integration('StockTransactionMongoRepository rollback with MongoDB', () => {
	let connection: mongoose.Connection
	let finishedGoodsEpcModel: mongoose.Model<any>
	let manufacturingOrderModel: mongoose.Model<any>
	let purchaseOrderModel: mongoose.Model<any>
	let dailyMoInventoryLedgerModel: mongoose.Model<any>
	let dailyPoShippingProgressModel: mongoose.Model<any>
	let stockTransactionRepository: StockTransactionMongoRepository
	const redisLists = new Map<string, string[]>()
	let failNextRedisSet = false

	const redisClient = {
		lpush: async (key: string, value: string) => {
			const list = redisLists.get(key) ?? []
			list.unshift(value)
			redisLists.set(key, list)
			return list.length
		},
		lrange: async (key: string) => redisLists.get(key) ?? [],
		eval: async (_script: string, _keyCount: number, key: string, entry: string, value: string) => {
			if (failNextRedisSet) {
				failNextRedisSet = false
				throw new Error('Redis write failed')
			}
			const list = redisLists.get(key) ?? []
			const index = list.indexOf(entry)
			if (index >= 0) list[index] = value
		},
		ttl: async () => 1,
		expireat: async () => 1
	}

	beforeAll(async () => {
		connection = await mongoose
			.createConnection(uri, { dbName: `stock_flow_rollback_${randomUUID().replaceAll('-', '')}` })
			.asPromise()

		connection.model('Department', new mongoose.Schema({ code: String, name: mongoose.Schema.Types.Mixed }))
		connection.model('StorageLocation', new mongoose.Schema({ name: String }))
		finishedGoodsEpcModel = connection.model(FinishedGoodsEpc.name, FinishedGoodsEpcSchema)
		manufacturingOrderModel = connection.model(ManufacturingOrder.name, ManufacturingOrderSchema)
		purchaseOrderModel = connection.model(PurchaseOrder.name, PurchaseOrderSchema)
		dailyMoInventoryLedgerModel = connection.model(DailyMoInventoryLedger.name, DailyMoInventoryLedgerSchema)
		dailyPoShippingProgressModel = connection.model(DailyPoShippingProgress.name, DailyPoShippingProgressSchema)

		const adapter = new TransactionalAdapterMongoose({ mongooseConnectionToken: DATA_WAREHOUSE_CONNECTION })
		const txHost = new TransactionHost({
			connectionName: DATA_WAREHOUSE_CONNECTION,
			...adapter.optionsFactory(connection)
		} as never)
		const inventoryAuditRepository = { updateInventoryAuditFluctuation: async () => undefined }
		const inventoryLedgerRepository = new InventoryLedgerRepository(
			finishedGoodsEpcModel,
			manufacturingOrderModel,
			dailyMoInventoryLedgerModel,
			dailyPoShippingProgressModel,
			purchaseOrderModel,
			inventoryAuditRepository as never,
			txHost
		)
		const shippingProgressRepository = new ShippingProgressMongoRepository(
			purchaseOrderModel,
			dailyPoShippingProgressModel,
			txHost
		)
		stockTransactionRepository = new StockTransactionMongoRepository(
			finishedGoodsEpcModel,
			inventoryLedgerRepository,
			shippingProgressRepository,
			txHost,
			redisClient as never
		)

		await Promise.all([
			finishedGoodsEpcModel.init(),
			manufacturingOrderModel.init(),
			purchaseOrderModel.init(),
			dailyMoInventoryLedgerModel.init(),
			dailyPoShippingProgressModel.init()
		])
	}, 30000)

	beforeEach(async () => {
		redisLists.clear()
		failNextRedisSet = false
		await Promise.all([
			finishedGoodsEpcModel.deleteMany({}),
			manufacturingOrderModel.deleteMany({}),
			purchaseOrderModel.deleteMany({}),
			dailyMoInventoryLedgerModel.deleteMany({}),
			dailyPoShippingProgressModel.deleteMany({})
		])
	})

	afterAll(async () => {
		if (!connection) return
		await connection.dropDatabase()
		await connection.close()
	})

	it('rejects a partial inbound rollback without changing any EPC or ledger quantity', async () => {
		const moNo = id('MO')
		const transactionId = id('SI')
		const firstEpc = epcId()
		const secondEpc = epcId()
		await createMo(moNo, { orderQty: 2, stockedInQty: 0 })
		await createEpc(firstEpc, moNo, FinishedGoodsEpcStatus.SCANNING, 0)
		await createEpc(secondEpc, moNo, FinishedGoodsEpcStatus.SCANNING, 0)
		await stockTransactionRepository.stockIn(transactionId, [stockInEpc(firstEpc, moNo), stockInEpc(secondEpc, moNo)])
		await finishedGoodsEpcModel.updateOne({ epc: secondEpc }, { $set: { last_tx: id('NEW') } })
		const before = await manufacturingOrderModel.findOne({ mo_no: moNo }).lean()

		await expect(stockTransactionRepository.rollbackInboundTransaction(transactionId)).rejects.toMatchObject({
			name: 'StockTransactionNotRollbackableException'
		})

		expect((await manufacturingOrderModel.findOne({ mo_no: moNo }).lean()).size_ledger).toEqual(before.size_ledger)
		expect(
			await finishedGoodsEpcModel.countDocuments({
				epc: { $in: [firstEpc, secondEpc] },
				status: FinishedGoodsEpcStatus.IN_STOCK
			})
		).toBe(2)
	})

	it('rejects rollback when a persisted counter cannot cover the full inverse', async () => {
		const moNo = id('MO')
		const transactionId = id('SI')
		const epc = epcId()
		await createMo(moNo, { orderQty: 1, stockedInQty: 0 })
		await createEpc(epc, moNo, FinishedGoodsEpcStatus.SCANNING, 0)
		await stockTransactionRepository.stockIn(transactionId, [stockInEpc(epc, moNo)])
		await manufacturingOrderModel.updateOne({ mo_no: moNo }, { $set: { 'size_ledger.8.stocked_in_qty': 0 } })

		await expect(stockTransactionRepository.rollbackInboundTransaction(transactionId)).rejects.toMatchObject({
			name: 'StockTransactionNotRollbackableException'
		})

		expect((await finishedGoodsEpcModel.findOne({ epc }).lean()).status).toBe(FinishedGoodsEpcStatus.IN_STOCK)
		expect((await manufacturingOrderModel.findOne({ mo_no: moNo }).lean()).size_ledger['8'].stocked_in_qty).toBe(0)
		const ledger = await dailyMoInventoryLedgerModel.findOne({ mo_no: moNo }).lean()
		expect(ledger.size_ledger['8'].stocked_in_qty).toBe(1)
		expect(ledger.transaction_history[transactionId].voided).toBe(false)
	})

	it('uses MongoDB history when Redis is stale and treats a completed rollback as a no-op', async () => {
		const moNo = id('MO')
		const transactionId = id('SI')
		const epc = epcId()
		await createMo(moNo, { orderQty: 1, stockedInQty: 0 })
		await createEpc(epc, moNo, FinishedGoodsEpcStatus.SCANNING, 0)
		await stockTransactionRepository.stockIn(transactionId, [stockInEpc(epc, moNo)])
		await dailyMoInventoryLedgerModel.updateOne(
			{ mo_no: moNo },
			{ $unset: { [`transaction_history.${transactionId}.tx_type`]: '' } }
		)
		const cached = JSON.parse(redisLists.get('transactions:inbound')[0])
		redisLists.set('transactions:inbound', [JSON.stringify({ ...cached, voided: true })])

		const rolledBack = await stockTransactionRepository.rollbackInboundTransaction(transactionId)
		const repeatedRollback = await stockTransactionRepository.rollbackInboundTransaction(transactionId)

		expect(rolledBack).toEqual([{ epc, last_tx: transactionId, status: FinishedGoodsEpcStatus.IN_STOCK }])
		expect(repeatedRollback).toEqual([])
		expect((await manufacturingOrderModel.findOne({ mo_no: moNo }).lean()).size_ledger['8'].stocked_in_qty).toBe(0)
		expect((await finishedGoodsEpcModel.findOne({ epc }).lean()).status).toBe(FinishedGoodsEpcStatus.SCANNING)
		expect(JSON.parse(redisLists.get('transactions:inbound')[0]).voided).toBe(true)
	})

	it('marks only the rolled-back history entry when a concurrent push shifts Redis list indexes', async () => {
		const mo = id('MO')
		const target = id('SI')
		const concurrent = id('SI')
		const epc = epcId()
		const key = 'transactions:inbound'
		await createMo(mo, { orderQty: 1, stockedInQty: 0 })
		await createEpc(epc, mo, FinishedGoodsEpcStatus.SCANNING, 0)
		await stockTransactionRepository.stockIn(target, [stockInEpc(epc, mo)])

		const read = jest.spyOn(redisClient, 'lrange').mockImplementationOnce(async () => {
			const snapshot = [...redisLists.get(key)]
			await redisClient.lpush(key, JSON.stringify({ id: concurrent, voided: false }))
			return snapshot
		})
		try {
			await stockTransactionRepository.rollbackInboundTransaction(target)
			expect(redisLists.get(key).map((entry) => JSON.parse(entry))).toEqual([
				{ id: concurrent, voided: false },
				expect.objectContaining({ id: target, voided: true })
			])
		} finally {
			read.mockRestore()
		}
	})

	it('applies the inverse ledger only once when two inbound rollbacks race', async () => {
		const moNo = id('MO')
		const transactionId = id('SI')
		const epc = epcId()
		await createMo(moNo, { orderQty: 1, stockedInQty: 0 })
		await createEpc(epc, moNo, FinishedGoodsEpcStatus.SCANNING, 0)
		await stockTransactionRepository.stockIn(transactionId, [stockInEpc(epc, moNo)])

		const results = await Promise.all([
			stockTransactionRepository.rollbackInboundTransaction(transactionId),
			stockTransactionRepository.rollbackInboundTransaction(transactionId)
		])

		expect(results.flat()).toHaveLength(1)
		expect((await manufacturingOrderModel.findOne({ mo_no: moNo }).lean()).size_ledger['8'].stocked_in_qty).toBe(0)
		expect((await finishedGoodsEpcModel.findOne({ epc }).lean()).status).toBe(FinishedGoodsEpcStatus.SCANNING)
	})

	it('rolls back outbound EPC and MO/PO counters together', async () => {
		const po = id('PO')
		const moNo = id('MO')
		const transactionId = id('XF')
		const epc = epcId()
		await createPo(po, { orderQty: 1, shippedOutQty: 0 })
		await createMo(moNo, { orderQty: 1, stockedInQty: 1, shippedOutQty: 0 })
		await createEpc(epc, moNo, FinishedGoodsEpcStatus.SCANNING, 1, po)
		await stockTransactionRepository.stockOut(transactionId, po, [outboundEpc(epc, moNo, po)])

		const rolledBack = await stockTransactionRepository.rollbackOutboundTransaction(transactionId)
		const repeatedRollback = await stockTransactionRepository.rollbackOutboundTransaction(transactionId)

		expect(rolledBack).toEqual([{ epc, last_tx: transactionId, status: FinishedGoodsEpcStatus.SHIPPED }])
		expect(repeatedRollback).toEqual([])
		expect((await manufacturingOrderModel.findOne({ mo_no: moNo }).lean()).size_ledger['8'].shipped_out_qty).toBe(0)
		expect((await purchaseOrderModel.findOne({ po }).lean()).shipping_progress['8'].shipped_out_qty).toBe(0)
		expect((await finishedGoodsEpcModel.findOne({ epc }).lean()).status).toBe(FinishedGoodsEpcStatus.SCANNING)
	})

	it('rolls back recall without decrementing the original stock-in quantity', async () => {
		const moNo = id('MO')
		const transactionId = id('RC')
		const epc = epcId()
		await createMo(moNo, { orderQty: 1, stockedInQty: 1 })
		await createEpc(epc, moNo, FinishedGoodsEpcStatus.IN_STOCK, 1)
		await stockTransactionRepository.recallFromStock(transactionId, [recallEpc(epc, moNo)])

		const rolledBack = await stockTransactionRepository.rollbackInboundTransaction(transactionId)

		expect(rolledBack).toEqual([{ epc, last_tx: transactionId, status: FinishedGoodsEpcStatus.RECALLED }])
		expect((await manufacturingOrderModel.findOne({ mo_no: moNo }).lean()).size_ledger['8']).toMatchObject({
			stocked_in_qty: 1,
			total_recall_tx: 0
		})
		expect((await finishedGoodsEpcModel.findOne({ epc }).lean()).status).toBe(FinishedGoodsEpcStatus.IN_STOCK)
	})

	it('rejects recall rollback when its freed size capacity has been filled', async () => {
		const mo_no = id('MO')
		const recallId = id('RC')
		await createMo(mo_no, { orderQty: 40, stockedInQty: 40 })
		const recalled = Array.from({ length: 10 }, epcId)
		const replacements = Array.from({ length: 10 }, epcId)
		await Promise.all([
			...recalled.map((epc) => createEpc(epc, mo_no, FinishedGoodsEpcStatus.IN_STOCK, 1)),
			...replacements.map((epc) => createEpc(epc, mo_no, FinishedGoodsEpcStatus.SCANNING, 0))
		])
		await stockTransactionRepository.recallFromStock(
			recallId,
			recalled.map((epc) => recallEpc(epc, mo_no))
		)
		await stockTransactionRepository.stockIn(
			id('SI'),
			replacements.map((epc) => stockInEpc(epc, mo_no))
		)
		const ledgerBefore = await dailyMoInventoryLedgerModel.findOne({ mo_no }).lean()

		await expect(stockTransactionRepository.rollbackInboundTransaction(recallId)).rejects.toBeInstanceOf(
			StockTransactionNotRollbackableException
		)

		expect(await dailyMoInventoryLedgerModel.findOne({ mo_no }).lean()).toEqual(ledgerBefore)
		expect((await manufacturingOrderModel.findOne({ mo_no }).lean()).size_ledger['8']).toMatchObject({
			stocked_in_qty: 50,
			total_recall_tx: 10
		})
		expect(
			await finishedGoodsEpcModel.countDocuments({
				epc: { $in: recalled },
				last_tx: recallId,
				status: FinishedGoodsEpcStatus.RECALLED
			})
		).toBe(10)
	})

	it('keeps the MongoDB rollback committed when Redis projection update fails', async () => {
		const moNo = id('MO')
		const transactionId = id('SI')
		const epc = epcId()
		await createMo(moNo, { orderQty: 1, stockedInQty: 0 })
		await createEpc(epc, moNo, FinishedGoodsEpcStatus.SCANNING, 0)
		await stockTransactionRepository.stockIn(transactionId, [stockInEpc(epc, moNo)])
		failNextRedisSet = true

		await expect(stockTransactionRepository.rollbackInboundTransaction(transactionId)).rejects.toThrow(
			'Redis write failed'
		)

		expect((await manufacturingOrderModel.findOne({ mo_no: moNo }).lean()).size_ledger['8'].stocked_in_qty).toBe(0)
		expect((await finishedGoodsEpcModel.findOne({ epc }).lean()).status).toBe(FinishedGoodsEpcStatus.SCANNING)
		expect(
			(await dailyMoInventoryLedgerModel.findOne({ mo_no: moNo }).lean()).transaction_history[transactionId].voided
		).toBe(true)

		await expect(stockTransactionRepository.rollbackInboundTransaction(transactionId)).resolves.toEqual([])
	})

	it('does not overwrite a newer stock flow when rollback races with recall', async () => {
		const moNo = id('MO')
		const transactionId = id('SI')
		const recallTransactionId = id('RC')
		const epc = epcId()
		await createMo(moNo, { orderQty: 1, stockedInQty: 0 })
		await createEpc(epc, moNo, FinishedGoodsEpcStatus.SCANNING, 0)
		await stockTransactionRepository.stockIn(transactionId, [stockInEpc(epc, moNo)])

		const results = await Promise.allSettled([
			stockTransactionRepository.rollbackInboundTransaction(transactionId),
			stockTransactionRepository.recallFromStock(recallTransactionId, [recallEpc(epc, moNo)])
		])
		const currentEpc = await finishedGoodsEpcModel.findOne({ epc }).lean()
		const currentMo = await manufacturingOrderModel.findOne({ mo_no: moNo }).lean()

		expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
		expect(
			currentMo.size_ledger['8'].stocked_in_qty - currentMo.size_ledger['8'].total_recall_tx
		).toBeGreaterThanOrEqual(0)
		if (currentEpc.status === FinishedGoodsEpcStatus.RECALLED) {
			expect(currentEpc.last_tx).toBe(recallTransactionId)
			expect(currentMo.size_ledger['8'].stocked_in_qty).toBe(1)
			expect(currentMo.size_ledger['8'].total_recall_tx).toBe(1)
		} else {
			expect(currentEpc.status).toBe(FinishedGoodsEpcStatus.SCANNING)
			expect(currentMo.size_ledger['8'].stocked_in_qty).toBe(0)
			expect(currentMo.size_ledger['8'].total_recall_tx).toBe(0)
		}
	})

	function id(prefix: string): string {
		return `${prefix}-${randomUUID().replaceAll('-', '')}`
	}

	function epcId(): string {
		return `303400${randomUUID().replaceAll('-', '').slice(0, 18)}`
	}

	async function createMo(
		moNo: string,
		progress: { orderQty: number; stockedInQty: number; shippedOutQty?: number }
	): Promise<void> {
		await manufacturingOrderModel.create({
			mo_no: moNo,
			brand_name: 'brand',
			factory_code_produce: 'factory',
			factory_shoes_style: 'style',
			cust_shoes_style: 'style',
			color_sn: 'color',
			order_qty: progress.orderQty,
			size_ledger: {
				'8': {
					order_qty: progress.orderQty,
					stocked_in_qty: progress.stockedInQty,
					total_recall_tx: 0,
					total_return_tx: 0,
					shipped_out_qty: progress.shippedOutQty ?? 0
				}
			}
		})
	}

	async function createPo(po: string, progress: { orderQty: number; shippedOutQty: number }): Promise<void> {
		await purchaseOrderModel.create({
			po,
			order_qty: progress.orderQty,
			brand_name: 'brand',
			cust_shoes_style: 'style',
			factory_shoes_style: 'style',
			color_sn: 'color',
			packing: {},
			shipping_progress: { '8': { order_qty: progress.orderQty, shipped_out_qty: progress.shippedOutQty } }
		})
	}

	async function createEpc(
		epc: string,
		moNo: string,
		status: FinishedGoodsEpcStatus.SCANNING | FinishedGoodsEpcStatus.IN_STOCK,
		inboundTimes: number,
		po: string | null = null
	): Promise<void> {
		await finishedGoodsEpcModel.create({
			epc,
			scannable: true,
			mo_no: moNo,
			po,
			factory_code_produce: 'factory',
			color_sn: 'color',
			factory_shoes_style: 'style',
			size_numcode: '8',
			inbound_device_sn: 'device',
			inbound_times: inboundTimes,
			status,
			deleted: false,
			outbound_at: null,
			storage_location: null
		})
	}

	function stockInEpc(epc: string, moNo: string): ElectronicProductCode {
		return new ElectronicProductCode(epc, {
			mo_no: moNo,
			factory_shoes_style: 'style',
			color_sn: 'color',
			size_numcode: new SizeNumber('8'),
			factory_code_produce: 'factory',
			assembly_line: {
				_id: new Types.ObjectId(),
				code: 'assembly',
				name: { cn: 'Assembly' }
			} as never,
			storage_location: { _id: new Types.ObjectId(), name: 'location' } as never
		})
	}

	function outboundEpc(epc: string, moNo: string, po: string): ElectronicProductCode {
		return new ElectronicProductCode(epc, {
			mo_no: moNo,
			factory_shoes_style: 'style',
			color_sn: 'color',
			size_numcode: new SizeNumber('8'),
			factory_code_produce: 'factory',
			po
		})
	}

	function recallEpc(epc: string, moNo: string): ElectronicProductCode {
		return new ElectronicProductCode(epc, {
			mo_no: moNo,
			factory_shoes_style: 'style',
			color_sn: 'color',
			size_numcode: new SizeNumber('8'),
			factory_code_produce: 'factory'
		})
	}
})
