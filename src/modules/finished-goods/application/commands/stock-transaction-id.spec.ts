import { RecallFromStockHandler } from './recall-from-stock/recall-from-stock.handler'
import { StockInHandler } from './stock-in/stock-in.handler'
import { StockOutHandler } from './stock-out/stock-out.handler'

describe('stock transaction handlers', () => {
	const ids = { nextId: jest.fn() }
	const epcs = {
		getPendingStockMoveEpcs: jest.fn().mockResolvedValue([]),
		getPendingShipOutEpcs: jest.fn().mockResolvedValue([])
	}
	const orders = { getManufacturingOrderInventory: jest.fn().mockResolvedValue([]) }
	const transactions = {
		stockIn: jest.fn().mockResolvedValue(undefined),
		stockOut: jest.fn().mockResolvedValue(undefined),
		recallFromStock: jest.fn().mockResolvedValue(undefined)
	}
	const publisher = { mergeObjectContext: jest.fn() }

	beforeEach(() => {
		jest.clearAllMocks()
	})

	it('persists stock-in with an allocated SI ID', async () => {
		ids.nextId.mockResolvedValue('SI-261113-001')
		const lookup = { findOneById: jest.fn().mockResolvedValue({}) }
		const handler = new StockInHandler(
			epcs as never,
			orders as never,
			lookup as never,
			lookup as never,
			transactions as never,
			publisher as never,
			ids
		)

		await handler.execute({ command: { mo_no: 'MO', inbound_device_sn: 'device' } } as never)

		expect(ids.nextId).toHaveBeenCalledWith('stock_in')
		expect(transactions.stockIn).toHaveBeenCalledWith('SI-261113-001', [])
	})

	it('persists recall with an allocated RC ID', async () => {
		ids.nextId.mockResolvedValue('RC-261113-001')
		const handler = new RecallFromStockHandler(
			epcs as never,
			orders as never,
			transactions as never,
			publisher as never,
			ids
		)

		await handler.execute({ command: { mo_no: 'MO', inbound_device_sn: 'device' } } as never)

		expect(ids.nextId).toHaveBeenCalledWith('recall')
		expect(transactions.recallFromStock).toHaveBeenCalledWith('RC-261113-001', [])
	})

	it('persists stock-out with an allocated XF ID', async () => {
		ids.nextId.mockResolvedValue('XF-261113-001')
		const progress = { getPoOutboundProgress: jest.fn().mockResolvedValue([]) }
		const handler = new StockOutHandler(
			epcs as never,
			orders as never,
			progress as never,
			transactions as never,
			publisher as never,
			ids
		)

		await handler.execute({ manufacturingOrders: 'MO', purchaseOrder: 'PO', sizes: [] } as never)

		expect(ids.nextId).toHaveBeenCalledWith('stock_out')
		expect(transactions.stockOut).toHaveBeenCalledWith('XF-261113-001', 'PO', [])
	})
})
