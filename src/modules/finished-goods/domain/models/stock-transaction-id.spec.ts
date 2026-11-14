import { ExcessInboundOrderException, ExcessOutboundOrderException } from '../exceptions/excess-order.exception'
import { InsufficientInventoryException } from '../exceptions/insufficient-inventory.exception'
import { ElectronicProductCode } from '../value-objects/epc.vo'
import { SizeNumber } from '../value-objects/size-number.vo'
import { RecallFromStockTransaction } from './recall-transaction.model'
import { StockInTransaction } from './stock-in-transaction.model'
import { StockOutTransaction } from './stock-out-transaction.model'

describe('stock transaction identifiers', () => {
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
			[{ size_numcode: new SizeNumber('8'), order_qty: 1, instock_qty: 1 }],
			'SI-261113-001'
		)
		expect(() => transaction.startTransaction()).toThrow(ExcessInboundOrderException)
	})

	it('still rejects recalls with insufficient inventory', () => {
		const transaction = new RecallFromStockTransaction(
			[epc()],
			[{ size_numcode: new SizeNumber('8'), order_qty: 1, instock_qty: 0 }],
			'RC-261113-001'
		)
		expect(() => transaction.startTransaction()).toThrow(InsufficientInventoryException)
	})

	it('still rejects stock-out quantities exceeding the order', () => {
		const transaction = new StockOutTransaction(
			[epc()],
			[{ size_numcode: new SizeNumber('8'), order_qty: 1, accumulated_qty: 1 }],
			[{ mo_no: 'MO', size_numcode: new SizeNumber('8'), order_qty: 1, instock_qty: 1 }],
			'XF-261113-001'
		)
		expect(() => transaction.startTransaction()).toThrow(ExcessOutboundOrderException)
	})

	it('still rejects stock-out quantities exceeding manufacturing-order inventory', () => {
		const transaction = new StockOutTransaction(
			[epc()],
			[{ size_numcode: new SizeNumber('8'), order_qty: 2, accumulated_qty: 0 }],
			[{ mo_no: 'MO', size_numcode: new SizeNumber('8'), order_qty: 1, instock_qty: 0 }],
			'XF-261113-002'
		)
		expect(() => transaction.startTransaction()).toThrow(InsufficientInventoryException)
	})
})

function epc(): ElectronicProductCode {
	return new ElectronicProductCode('sku', {
		mo_no: 'MO',
		factory_shoes_style: 'style',
		color_sn: 'color',
		size_numcode: new SizeNumber('8'),
		factory_code_produce: 'factory'
	})
}
