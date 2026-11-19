import { ExcessInboundOrderException, ExcessOutboundOrderException } from '../exceptions/excess-order.exception'
import { InsufficientInventoryException } from '../exceptions/insufficient-inventory.exception'
import { ElectronicProductCode } from '../value-objects/epc.vo'
import { SizeNumber } from '../value-objects/size-number.vo'
import { RecallFromStockTransaction } from './recall-transaction.model'
import { StockInTransaction } from './stock-in-transaction.model'
import { StockOutTransaction } from './stock-out-transaction.model'

describe('stock transaction identifiers', () => {
	it('rejects new intake for a size whose capacity was already shipped', () => {
		const progress = [{ size_numcode: new SizeNumber('8'), order_qty: 40, instock_qty: 0, shipped_out_qty: 40 }]
		expect(() => new StockInTransaction([epc()], progress, 'SI').startTransaction()).toThrow(
			ExcessInboundOrderException
		)
	})

	it('rejects shipment beyond the MO size ceiling even when the PO has room', () => {
		const po = [{ size_numcode: new SizeNumber('8'), order_qty: 60, accumulated_qty: 40 }]
		const mo = [
			{ mo_no: 'MO', size_numcode: new SizeNumber('8'), order_qty: 40, instock_qty: 1, shipped_out_qty: 40 }
		]
		expect(() => new StockOutTransaction([epc()], po, mo, 'XF').startTransaction()).toThrow(
			InsufficientInventoryException
		)
	})

	it('rejects recall for a missing size even when another size has stock', () => {
		const progress = [{ size_numcode: new SizeNumber('9'), order_qty: 40, instock_qty: 1, shipped_out_qty: 0 }]
		expect(() => new RecallFromStockTransaction([epc()], progress, 'RC').startTransaction()).toThrow(
			InsufficientInventoryException
		)
	})

	it('allows recall of a legacy excess only if it restores the size ceiling', () => {
		const progress = { size_numcode: new SizeNumber('8'), order_qty: 40, shipped_out_qty: 39 }
		expect(() =>
			new RecallFromStockTransaction([epc()], [{ ...progress, instock_qty: 3 }], 'RC').startTransaction()
		).toThrow(InsufficientInventoryException)
		expect(new RecallFromStockTransaction([epc()], [{ ...progress, instock_qty: 2 }], 'RC').startTransaction()).toBe(
			'RC'
		)
	})

	it('uses the allocated ID for stock-in', () => {
		const transaction = new StockInTransaction([], [], 'SI-261113-001')

		expect(transaction.startTransaction()).toBe('SI-261113-001')
	})

	it('uses the allocated ID for recall', () => {
		const transaction = new RecallFromStockTransaction([], [], 'RC-261113-002')

		expect(transaction.startTransaction()).toBe('RC-261113-002')
	})

	it('uses the allocated ID for stock-out', () => {
		const transaction = new StockOutTransaction([], [], [], 'XF-261113-003')

		expect(transaction.startTransaction()).toBe('XF-261113-003')
		expect(transaction.shipOutTransactionId).toBe('XF-261113-003')
	})

	it('still rejects inbound quantities exceeding the order', () => {
		const transaction = new StockInTransaction(
			[epc()],
			[{ size_numcode: new SizeNumber('8'), order_qty: 1, instock_qty: 1, shipped_out_qty: 0 }],
			'SI-261113-001'
		)
		expect(() => transaction.startTransaction()).toThrow(ExcessInboundOrderException)
	})

	it('rejects inbound quantities for sizes absent from the manufacturing order', () => {
		const transaction = new StockInTransaction(
			[
				new ElectronicProductCode('sku-size-9', {
					mo_no: 'MO',
					factory_shoes_style: 'style',
					color_sn: 'color',
					size_numcode: new SizeNumber('9'),
					factory_code_produce: 'factory'
				})
			],
			[{ size_numcode: new SizeNumber('8'), order_qty: 1, instock_qty: 0, shipped_out_qty: 0 }],
			'SI-261113-002'
		)

		expect(() => transaction.startTransaction()).toThrow(ExcessInboundOrderException)
	})

	it('still rejects recalls with insufficient inventory', () => {
		const transaction = new RecallFromStockTransaction(
			[epc()],
			[{ size_numcode: new SizeNumber('8'), order_qty: 1, instock_qty: 0, shipped_out_qty: 0 }],
			'RC-261113-001'
		)
		expect(() => transaction.startTransaction()).toThrow(InsufficientInventoryException)
	})

	it('still rejects stock-out quantities exceeding the order', () => {
		const transaction = new StockOutTransaction(
			[epc()],
			[{ size_numcode: new SizeNumber('8'), order_qty: 1, accumulated_qty: 1 }],
			[{ mo_no: 'MO', size_numcode: new SizeNumber('8'), order_qty: 1, instock_qty: 1, shipped_out_qty: 0 }],
			'XF-261113-001'
		)
		expect(() => transaction.startTransaction()).toThrow(ExcessOutboundOrderException)
	})

	it('rejects PO quantities exceeded by the combined quantity from multiple manufacturing orders', () => {
		const transaction = new StockOutTransaction(
			[
				epc('MO-1'),
				new ElectronicProductCode('sku-mo-2', {
					mo_no: 'MO-2',
					factory_shoes_style: 'style',
					color_sn: 'color',
					size_numcode: new SizeNumber('8'),
					factory_code_produce: 'factory'
				})
			],
			[{ size_numcode: new SizeNumber('8'), order_qty: 1, accumulated_qty: 0 }],
			[
				{ mo_no: 'MO-1', size_numcode: new SizeNumber('8'), order_qty: 1, instock_qty: 1, shipped_out_qty: 0 },
				{ mo_no: 'MO-2', size_numcode: new SizeNumber('8'), order_qty: 1, instock_qty: 1, shipped_out_qty: 0 }
			],
			'XF-261113-003'
		)

		expect(() => transaction.startTransaction()).toThrow(ExcessOutboundOrderException)
	})

	it('still rejects stock-out quantities exceeding manufacturing-order inventory', () => {
		const transaction = new StockOutTransaction(
			[epc()],
			[{ size_numcode: new SizeNumber('8'), order_qty: 2, accumulated_qty: 0 }],
			[{ mo_no: 'MO', size_numcode: new SizeNumber('8'), order_qty: 1, instock_qty: 0, shipped_out_qty: 0 }],
			'XF-261113-002'
		)
		expect(() => transaction.startTransaction()).toThrow(InsufficientInventoryException)
	})
})

function epc(mo_no: string = 'MO'): ElectronicProductCode {
	return new ElectronicProductCode(`sku-${mo_no}`, {
		mo_no,
		factory_shoes_style: 'style',
		color_sn: 'color',
		size_numcode: new SizeNumber('8'),
		factory_code_produce: 'factory'
	})
}
