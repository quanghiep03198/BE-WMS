import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { FinishedGoodsEpcStatus } from '@modules/finished-goods/domain/constants'
import {
	ExcessInboundOrderException,
	ExcessOutboundOrderException
} from '@modules/finished-goods/domain/exceptions/excess-order.exception'
import { InsufficientInventoryException } from '@modules/finished-goods/domain/exceptions/insufficient-inventory.exception'
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

integration('StockTransactionMongoRepository concurrent stock flows with MongoDB', () => {
	let connection: mongoose.Connection
	let finishedGoodsEpcModel: mongoose.Model<any>
	let manufacturingOrderModel: mongoose.Model<any>
	let purchaseOrderModel: mongoose.Model<any>
	let dailyMoInventoryLedgerModel: mongoose.Model<any>
	let dailyPoShippingProgressModel: mongoose.Model<any>
	let inventoryLedgerRepository: InventoryLedgerRepository
	let stockTransactionRepository: StockTransactionMongoRepository

	beforeAll(async () => {
		connection = await mongoose
			.createConnection(uri, { dbName: `stock_flow_concurrency_${randomUUID().replaceAll('-', '')}` })
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
		inventoryLedgerRepository = new InventoryLedgerRepository(
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
			{ lpush: async () => 1, ttl: async () => 1, expireat: async () => 1 } as never
		)

		await Promise.all([
			finishedGoodsEpcModel.init(),
			manufacturingOrderModel.init(),
			purchaseOrderModel.init(),
			dailyMoInventoryLedgerModel.init(),
			dailyPoShippingProgressModel.init()
		])
	}, 30000)

	afterAll(async () => {
		if (!connection) return
		await connection.dropDatabase()
		await connection.close()
	})

	it('rejects stale stock-ins that would exceed an MO size order and rolls back EPC changes', async () => {
		const moNo = id('MO')
		const firstEpc = epcId()
		const secondEpc = epcId()
		await createMo(moNo, { orderQty: 1, stockedInQty: 0 })
		await createEpc(firstEpc, moNo, FinishedGoodsEpcStatus.SCANNING, 0)
		await createEpc(secondEpc, moNo, FinishedGoodsEpcStatus.SCANNING, 0)
		const first = stockInEpc(firstEpc, moNo)
		const second = stockInEpc(secondEpc, moNo)

		const results = await withStaleProgressSnapshot(firstEpc, secondEpc, (markFirstCommitted) => {
			const firstRequest = stockTransactionRepository.stockIn(id('SI'), [first]).finally(markFirstCommitted)
			return Promise.allSettled([firstRequest, stockTransactionRepository.stockIn(id('SI'), [second])])
		})
		const rejected = getRejectedResult(results)

		expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
		expect(rejected?.reason).toBeInstanceOf(ExcessInboundOrderException)
		expect((await manufacturingOrderModel.findOne({ mo_no: moNo }).lean()).size_ledger['8'].stocked_in_qty).toBe(1)
		expect(
			await finishedGoodsEpcModel.countDocuments({
				epc: { $in: [firstEpc, secondEpc] },
				status: FinishedGoodsEpcStatus.SCANNING
			})
		).toBe(1)
	})

	it('rejects stock-outs from different MOs when their total exceeds the PO size order', async () => {
		const po = id('PO')
		const moOne = id('MO')
		const moTwo = id('MO')
		const firstEpc = epcId()
		const secondEpc = epcId()
		await createPo(po, { orderQty: 1, shippedOutQty: 0 })
		await createMo(moOne, { orderQty: 1, stockedInQty: 1 })
		await createMo(moTwo, { orderQty: 1, stockedInQty: 1 })
		await createEpc(firstEpc, moOne, FinishedGoodsEpcStatus.SCANNING, 1, po)
		await createEpc(secondEpc, moTwo, FinishedGoodsEpcStatus.SCANNING, 1, po)

		const results = await withStaleProgressSnapshot(firstEpc, secondEpc, (markFirstCommitted) => {
			const firstRequest = stockTransactionRepository
				.stockOut(id('XF'), po, [outboundEpc(firstEpc, moOne, po)])
				.finally(markFirstCommitted)
			return Promise.allSettled([
				firstRequest,
				stockTransactionRepository.stockOut(id('XF'), po, [outboundEpc(secondEpc, moTwo, po)])
			])
		})
		const rejected = getRejectedResult(results)

		expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
		expect(rejected?.reason).toBeInstanceOf(ExcessOutboundOrderException)
		expect((await purchaseOrderModel.findOne({ po }).lean()).shipping_progress['8'].shipped_out_qty).toBe(1)
		expect(
			await finishedGoodsEpcModel.countDocuments({
				epc: { $in: [firstEpc, secondEpc] },
				status: FinishedGoodsEpcStatus.SCANNING
			})
		).toBe(1)
		const manufacturingOrders = await manufacturingOrderModel.find({ mo_no: { $in: [moOne, moTwo] } }).lean()
		expect(manufacturingOrders.reduce((sum, mo) => sum + mo.size_ledger['8'].shipped_out_qty, 0)).toBe(1)
	})

	it('rejects recalls exceeding the remaining MO inventory and rolls back EPC changes', async () => {
		const moNo = id('MO')
		const firstEpc = epcId()
		const secondEpc = epcId()
		await createMo(moNo, { orderQty: 2, stockedInQty: 1 })
		await createEpc(firstEpc, moNo, FinishedGoodsEpcStatus.IN_STOCK, 1)
		await createEpc(secondEpc, moNo, FinishedGoodsEpcStatus.IN_STOCK, 1)

		const results = await withStaleProgressSnapshot(firstEpc, secondEpc, (markFirstCommitted) => {
			const firstRequest = stockTransactionRepository
				.recallFromStock(id('RC'), [recallEpc(firstEpc, moNo)])
				.finally(markFirstCommitted)
			return Promise.allSettled([
				firstRequest,
				stockTransactionRepository.recallFromStock(id('RC'), [recallEpc(secondEpc, moNo)])
			])
		})
		const rejected = getRejectedResult(results)

		expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
		expect(rejected?.reason).toBeInstanceOf(InsufficientInventoryException)
		expect((await manufacturingOrderModel.findOne({ mo_no: moNo }).lean()).size_ledger['8'].total_recall_tx).toBe(1)
		expect(
			await finishedGoodsEpcModel.countDocuments({
				epc: { $in: [firstEpc, secondEpc] },
				status: FinishedGoodsEpcStatus.IN_STOCK
			})
		).toBe(1)
	})

	it.each([
		[50, 50, false],
		[60, 40, true]
	] as const)('checks the individual size limits for a 60/40 MO: %i/%i', async (size5, size6, accepted) => {
		const mo = id('MO')
		const tx = id('SI')
		await createMo(mo, { orderQty: 100, stockedInQty: 0 })
		await manufacturingOrderModel.updateOne(
			{ mo_no: mo },
			{
				$set: { size_ledger: { '05': { order_qty: 60 }, '06': { order_qty: 40 } } }
			}
		)
		const epcs = await Promise.all(
			[...Array(size5).fill('05'), ...Array(size6).fill('06')].map(async (size: string) => {
				const epc = epcId()
				await createEpc(epc, mo, FinishedGoodsEpcStatus.SCANNING, 0, null, size)
				return stockInEpc(epc, mo, size)
			})
		)
		const result = stockTransactionRepository.stockIn(tx, epcs)
		if (accepted) await result
		else await expect(result).rejects.toBeInstanceOf(ExcessInboundOrderException)
		const { size_ledger: ledger } = await manufacturingOrderModel.findOne({ mo_no: mo }).lean()
		expect(ledger['05'].stocked_in_qty ?? 0).toBe(accepted ? 60 : 0)
		expect(ledger['06'].stocked_in_qty ?? 0).toBe(accepted ? 40 : 0)
		expect(await finishedGoodsEpcModel.countDocuments({ mo_no: mo, status: FinishedGoodsEpcStatus.IN_STOCK })).toBe(
			accepted ? 100 : 0
		)
		expect(await dailyMoInventoryLedgerModel.countDocuments({ mo_no: mo })).toBe(accepted ? 1 : 0)
	})

	it('does not reopen MO intake capacity after shipment, including competing stale reads', async () => {
		const mo = id('MO')
		const first = epcId()
		const second = epcId()
		await createMo(mo, { orderQty: 40, stockedInQty: 39, shippedOutQty: 39 })
		for (const epc of [first, second]) await createEpc(epc, mo, FinishedGoodsEpcStatus.SCANNING, 0)
		const results = await withStaleProgressSnapshot(first, second, (committed) =>
			Promise.allSettled([
				stockTransactionRepository.stockIn(id('SI'), [stockInEpc(first, mo)]).finally(committed),
				stockTransactionRepository.stockIn(id('SI'), [stockInEpc(second, mo)])
			])
		)
		expect(results.map(({ status }) => status)).toEqual(['fulfilled', 'rejected'])
		expect(getRejectedResult(results)?.reason).toBeInstanceOf(ExcessInboundOrderException)
		expect((await manufacturingOrderModel.findOne({ mo_no: mo }).lean()).size_ledger['8'].stocked_in_qty).toBe(40)
		expect((await finishedGoodsEpcModel.findOne({ epc: second }).lean()).status).toBe(FinishedGoodsEpcStatus.SCANNING)
	})

	it('rejects shipment beyond the MO size ceiling even when legacy stock and PO capacity remain', async () => {
		const mo = id('MO')
		const po = id('PO')
		const epc = epcId()
		await createMo(mo, { orderQty: 40, stockedInQty: 41, shippedOutQty: 40 })
		await createPo(po, { orderQty: 60, shippedOutQty: 40 })
		await createEpc(epc, mo, FinishedGoodsEpcStatus.SCANNING, 1, po)
		await expect(
			stockTransactionRepository.stockOut(id('XF'), po, [outboundEpc(epc, mo, po)])
		).rejects.toBeInstanceOf(InsufficientInventoryException)
		expect((await purchaseOrderModel.findOne({ po }).lean()).shipping_progress['8'].shipped_out_qty).toBe(40)
		expect(await dailyPoShippingProgressModel.countDocuments({ po })).toBe(0)
		expect((await finishedGoodsEpcModel.findOne({ epc }).lean()).status).toBe(FinishedGoodsEpcStatus.SCANNING)
	})

	it('rejects recall of a missing size even when another size has stock', async () => {
		const mo = id('MO')
		const epc = epcId()
		await createMo(mo, { orderQty: 40, stockedInQty: 1 })
		await createEpc(epc, mo, FinishedGoodsEpcStatus.IN_STOCK, 1, null, '9')
		await expect(
			stockTransactionRepository.recallFromStock(id('RC'), [stockInEpc(epc, mo, '9')])
		).rejects.toBeInstanceOf(InsufficientInventoryException)
		expect((await finishedGoodsEpcModel.findOne({ epc }).lean()).status).toBe(FinishedGoodsEpcStatus.IN_STOCK)
	})

	it('allows recall to repair an overfilled size and allows another recall after valid re-entry', async () => {
		const mo = id('MO')
		const epc = epcId()
		await createMo(mo, { orderQty: 1, stockedInQty: 2 })
		await createEpc(epc, mo, FinishedGoodsEpcStatus.IN_STOCK, 1)
		await stockTransactionRepository.recallFromStock(id('RC'), [recallEpc(epc, mo)])
		// Free another slot before returning the same EPC.
		const other = epcId()
		await createEpc(other, mo, FinishedGoodsEpcStatus.IN_STOCK, 1)
		await stockTransactionRepository.recallFromStock(id('RC'), [recallEpc(other, mo)])
		await finishedGoodsEpcModel.updateOne({ epc }, { $set: { status: FinishedGoodsEpcStatus.SCANNING } })
		await stockTransactionRepository.stockIn(id('SI'), [stockInEpc(epc, mo)])
		await stockTransactionRepository.recallFromStock(id('RC'), [recallEpc(epc, mo)])
		expect((await manufacturingOrderModel.findOne({ mo_no: mo }).lean()).size_ledger['8']).toMatchObject({
			stocked_in_qty: 2,
			total_return_tx: 1,
			total_recall_tx: 3
		})
	})

	it('counts an EPC submitted by multiple commands at most once', async () => {
		const moNo = id('MO')
		const epc = epcId()
		await createMo(moNo, { orderQty: 2, stockedInQty: 0 })
		await createEpc(epc, moNo, FinishedGoodsEpcStatus.SCANNING, 0)
		const pending = stockInEpc(epc, moNo)

		const results = await Promise.allSettled([
			stockTransactionRepository.stockIn(id('SI'), [pending]),
			stockTransactionRepository.stockIn(id('SI'), [pending])
		])
		const rejected = getRejectedResult(results)

		expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
		expect(rejected?.reason).toBeInstanceOf(ExcessInboundOrderException)
		expect((await manufacturingOrderModel.findOne({ mo_no: moNo }).lean()).size_ledger['8'].stocked_in_qty).toBe(1)
	})

	it('rejects missing orders and sizes without creating progress documents', async () => {
		const missingMo = id('MO')
		const missingMoEpc = epcId()
		await createEpc(missingMoEpc, missingMo, FinishedGoodsEpcStatus.SCANNING, 0)

		await expect(
			stockTransactionRepository.stockIn(id('SI'), [stockInEpc(missingMoEpc, missingMo)])
		).rejects.toBeInstanceOf(ExcessInboundOrderException)
		expect(await manufacturingOrderModel.countDocuments({ mo_no: missingMo })).toBe(0)
		expect((await finishedGoodsEpcModel.findOne({ epc: missingMoEpc }).lean()).status).toBe(
			FinishedGoodsEpcStatus.SCANNING
		)

		const moNo = id('MO')
		const unknownSizeEpc = epcId()
		await createMo(moNo, { orderQty: 1, stockedInQty: 0 })
		await createEpc(unknownSizeEpc, moNo, FinishedGoodsEpcStatus.SCANNING, 0, null, '9')
		await expect(
			stockTransactionRepository.stockIn(id('SI'), [stockInEpc(unknownSizeEpc, moNo, '9')])
		).rejects.toBeInstanceOf(ExcessInboundOrderException)
		expect((await manufacturingOrderModel.findOne({ mo_no: moNo }).lean()).size_ledger['9']).toBeUndefined()
		expect((await finishedGoodsEpcModel.findOne({ epc: unknownSizeEpc }).lean()).status).toBe(
			FinishedGoodsEpcStatus.SCANNING
		)

		const po = id('PO')
		const outboundMo = id('MO')
		const outboundEpcId = epcId()
		await createMo(outboundMo, { orderQty: 1, stockedInQty: 1 })
		await createEpc(outboundEpcId, outboundMo, FinishedGoodsEpcStatus.SCANNING, 1, po)
		await expect(
			stockTransactionRepository.stockOut(id('XF'), po, [outboundEpc(outboundEpcId, outboundMo, po)])
		).rejects.toBeInstanceOf(ExcessOutboundOrderException)
		expect(await purchaseOrderModel.countDocuments({ po })).toBe(0)
		expect(
			(await manufacturingOrderModel.findOne({ mo_no: outboundMo }).lean()).size_ledger['8'].shipped_out_qty
		).toBe(0)
		expect((await finishedGoodsEpcModel.findOne({ epc: outboundEpcId }).lean()).status).toBe(
			FinishedGoodsEpcStatus.SCANNING
		)
	})

	function id(prefix: string): string {
		return `${prefix}-${randomUUID().replaceAll('-', '')}`
	}

	function epcId(): string {
		return `303400${randomUUID().replaceAll('-', '').slice(0, 18)}`
	}

	function getRejectedResult(results: PromiseSettledResult<void>[]): PromiseRejectedResult | undefined {
		return results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
	}

	async function withStaleProgressSnapshot<T>(
		firstEpc: string,
		secondEpc: string,
		run: (markFirstCommitted: () => void) => Promise<T>
	): Promise<T> {
		const firstKey = firstEpc
		const secondKey = secondEpc
		const snapshots = new Set<string>()
		let releaseBothReads!: () => void
		let releaseFirstCommit!: () => void
		const bothReads = new Promise<void>((resolve) => {
			releaseBothReads = resolve
		})
		const firstCommitted = new Promise<void>((resolve) => {
			releaseFirstCommit = resolve
		})
		const originalGetPending =
			inventoryLedgerRepository.getPendingInventoryFluctuation.bind(inventoryLedgerRepository)
		const progressReadSpy = jest
			.spyOn(inventoryLedgerRepository, 'getPendingInventoryFluctuation')
			.mockImplementation(async (scannedEpcs) => {
				const result = await originalGetPending(scannedEpcs)
				const key = scannedEpcs.map((epc) => epc.getStockKeepingUnit()).sort()[0]
				if (key === firstKey || key === secondKey) {
					snapshots.add(key)
					if (snapshots.size === 2) releaseBothReads()
					await bothReads
					if (key === secondKey) await firstCommitted
				}
				return result
			})

		try {
			return await run(releaseFirstCommit)
		} finally {
			progressReadSpy.mockRestore()
		}
	}

	async function createMo(
		moNo: string,
		progress: { orderQty: number; stockedInQty: number; totalRecallQty?: number; shippedOutQty?: number }
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
					total_recall_tx: progress.totalRecallQty ?? 0,
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
		po: string | null = null,
		size = '8'
	): Promise<void> {
		await finishedGoodsEpcModel.create({
			epc,
			scannable: true,
			mo_no: moNo,
			po,
			factory_code_produce: 'factory',
			color_sn: 'color',
			factory_shoes_style: 'style',
			size_numcode: size,
			inbound_device_sn: 'device',
			inbound_times: inboundTimes,
			status,
			deleted: false,
			outbound_at: null,
			storage_location: null
		})
	}

	function stockInEpc(epc: string, moNo: string, size = '8'): ElectronicProductCode {
		return new ElectronicProductCode(epc, {
			mo_no: moNo,
			factory_shoes_style: 'style',
			color_sn: 'color',
			size_numcode: new SizeNumber(size),
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
