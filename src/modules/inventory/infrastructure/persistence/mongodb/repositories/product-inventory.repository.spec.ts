import { GetProductionInventoryQuery } from '@modules/inventory/application/queries/get-production-inventory/get-production-inventory.query'
import { ManufacturingOrder, ManufacturingOrderSchema } from '@modules/order/schemas/manufacturing-order.schema'
import { PurchaseOrder, PurchaseOrderSchema } from '@modules/order/schemas/purchase-order.schema'
import { addMonths, format, subMonths } from 'date-fns'
import mongoose, { Connection } from 'mongoose'
import { MoInventoryAudit, MoInventoryAuditSchema } from '../schemas/inventory-audit.schema'
import { ProductInventoryRepository } from './product-inventory.repository'

const mongoUri = process.env.PRODUCT_INVENTORY_TEST_MONGO_URI

;(mongoUri ? describe : describe.skip)('ProductInventoryRepository outbound', () => {
	let connection: Connection
	let repository: ProductInventoryRepository

	beforeAll(async () => {
		if (!mongoUri) throw new Error('PRODUCT_INVENTORY_TEST_MONGO_URI is required')
		connection = await mongoose
			.createConnection(mongoUri, { dbName: `product_inventory_test_${Date.now()}_${process.pid}` })
			.asPromise()
		const audits = connection.model(MoInventoryAudit.name, MoInventoryAuditSchema)
		const orders = connection.model(ManufacturingOrder.name, ManufacturingOrderSchema)
		const purchases = connection.model(PurchaseOrder.name, PurchaseOrderSchema)
		repository = new ProductInventoryRepository(audits, orders, purchases)

		const current = format(new Date(), 'yyyy-MM')
		await audits.collection.insertMany([
			{ mo_no: 'MO-1', year_month: current, size_ledger: {} },
			{ mo_no: 'MO-2', year_month: current, size_ledger: {} },
			{ mo_no: 'MO-OLD', year_month: format(subMonths(new Date(), 1), 'yyyy-MM'), size_ledger: {} },
			{ mo_no: 'MO-FUTURE', year_month: format(addMonths(new Date(), 1), 'yyyy-MM'), size_ledger: {} }
		])
		const attributes = { brand_name: 'Brand', factory_shoes_style: 'Style', color_sn: 'Color' }
		await purchases.collection.insertMany([
			{
				...attributes,
				po: 'PO-1',
				order_qty: 50,
				packing: { 'MO-1': {}, 'MO-2': {} },
				shipping_progress: {
					'05': { order_qty: 10, shipped_out_qty: 10 },
					'06': { order_qty: 20, shipped_out_qty: 7 },
					'08': { order_qty: 20 }
				}
			},
			{
				...attributes,
				po: 'PO-2',
				order_qty: 12,
				packing: { 'MO-2': {} },
				shipping_progress: { '07': { order_qty: 12, shipped_out_qty: 12 } }
			},
			{ ...attributes, po: 'PO-3', order_qty: 3, packing: { 'MO-1': {} }, shipping_progress: null },
			{ ...attributes, po: 'OLD', order_qty: 1, packing: { 'MO-OLD': {} }, shipping_progress: {} },
			{ ...attributes, po: 'FUTURE', order_qty: 1, packing: { 'MO-FUTURE': {} }, shipping_progress: {} },
			{ ...attributes, po: 'EMPTY', order_qty: 1, packing: {}, shipping_progress: {} },
			{
				...attributes,
				po: 'NEXT-SHIP',
				order_qty: 1,
				packing: {},
				shipping_progress: { '05': { shipped_out_qty: 1 } }
			},
			{ ...attributes, brand_name: 'Other', po: 'OTHER', order_qty: 1, packing: { 'MO-1': {} } }
		])
		await connection.collection('daily_po_shipping_progress').insertMany([
			{ po: 'PO-1', date: `${current}-01` },
			{ po: 'PO-1', date: `${current}-28` },
			{ po: 'PO-1', date: `${format(addMonths(new Date(), 1), 'yyyy-MM')}-01` },
			{ po: 'PO-2', date: `${format(subMonths(new Date(), 1), 'yyyy-MM')}-28` },
			{ po: 'NEXT-SHIP', date: `${format(addMonths(new Date(), 1), 'yyyy-MM')}-01` }
		])
	})

	afterAll(async () => {
		await connection?.close()
	})

	it('returns current-month shipments and unshipped POs, excluding other months', async () => {
		const current = format(new Date(), 'yyyy-MM')
		const result = await repository.getProductionInventory(new GetProductionInventoryQuery('Brand', 'Style', 'Color'))

		expect(result.outbound).toEqual(
			expect.arrayContaining([
				{
					po: 'PO-1',
					order_qty: 50,
					last_outbound_at: `${current}-28`,
					shipped_out_qty: 17,
					size_ledger: [
						{ size_numcode: '05', qty: 10 },
						{ size_numcode: '06', qty: 7 },
						{ size_numcode: '08', qty: 0 }
					]
				},
				{ po: 'PO-3', order_qty: 3, last_outbound_at: null, shipped_out_qty: 0, size_ledger: [] },
				{ po: 'OLD', order_qty: 1, last_outbound_at: null, shipped_out_qty: 0, size_ledger: [] },
				{ po: 'FUTURE', order_qty: 1, last_outbound_at: null, shipped_out_qty: 0, size_ledger: [] },
				{ po: 'EMPTY', order_qty: 1, last_outbound_at: null, shipped_out_qty: 0, size_ledger: [] }
			])
		)
		expect(result.outbound).toHaveLength(5)
	})
})
