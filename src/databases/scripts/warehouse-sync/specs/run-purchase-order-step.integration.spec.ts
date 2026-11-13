import mongoose from 'mongoose'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { runPurchaseOrderStep } from '../run-purchase-order-step'

const uri = process.env.WAREHOUSE_SYNC_TEST_MONGO_URI
const integration = uri ? describe : describe.skip

integration('runPurchaseOrderStep', () => {
	it('stores the source packing and shipping progress and preserves the ID on rerun', async () => {
		const client = new mongoose.mongo.MongoClient(uri)
		const databaseName = `warehouse_sync_test_${randomUUID().replaceAll('-', '')}`
		let connected = false
		try {
			await client.connect()
			connected = true
			const database = client.db(databaseName)
			const parameters: Record<string, string> = {}
			let sql = ''
			let shippingMethod: string | null = 'OCEAN'
			let shippingDestination: string | null = 'US'
			const pool = {
				request: () => ({
					input: (name: string, value: string) => {
						parameters[name] = value
					},
					toReadableStream: () =>
						Readable.from([
							{
								po: 'PO123',
								order_qty: 5,
								shipping_method: shippingMethod,
								shipping_destination: shippingDestination,
								brand_name: 'UGG',
								factory_shoes_style: 'F1',
								cust_shoes_style: 'C1',
								color_sn: 'BLACK',
								packing: '{"14ABC":{"7":5}}',
								shipping_progress: '{"7":{"order_qty":5,"shipped_out_qty":2}}'
							}
						]),
					query: async (value: string) => {
						sql = value
					},
					cancel: () => true
				})
			}
			const cutoff = new Date('2026-11-11T17:00:00Z')
			expect(await runPurchaseOrderStep(pool, database, cutoff)).toEqual({ purchaseOrders: 1 })
			expect(parameters.cutoff).toBe('2026-11-12')
			expect(sql.match(/record_time\s*<\s*@cutoff/g)).toHaveLength(2)
			const collection = database.collection('purchase_orders')
			const first = await collection.findOne({ po: 'PO123' })
			expect(first).toMatchObject({
				packing: { '14ABC': { '7': 5 } },
				shipping_progress: { '7': { order_qty: 5, shipped_out_qty: 2 } },
				search_ngrams: expect.arrayContaining(['po', '123'])
			})
			shippingMethod = null
			shippingDestination = null
			await runPurchaseOrderStep(pool, database, cutoff)
			expect(await collection.findOne({ po: 'PO123' })).toMatchObject({
				_id: first._id,
				shipping_method: 'OCEAN',
				shipping_destination: 'US'
			})
			expect(await collection.countDocuments()).toBe(1)
		} finally {
			if (connected) await client.db(databaseName).dropDatabase()
			await client.close()
		}
	})
})
