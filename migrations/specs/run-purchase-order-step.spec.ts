import mongoose, { type mongo } from 'mongoose'
import { Readable } from 'node:stream'
import { PurchaseOrderSchema } from '@modules/order/schemas/purchase-order.schema'
import { runPurchaseOrderStep } from '../commands/run-purchase-order-step'

const cutoff = new Date('2026-11-11T17:00:00Z')

function sourceRow(shippingMethod: unknown, shippingDestination: unknown = 'US') {
	return {
		po: '100548754',
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
}

function setup(
	shippingMethod: unknown,
	shippingDestination: unknown = 'US',
	rows?: Array<ReturnType<typeof sourceRow>>
) {
	const writes: Array<mongo.AnyBulkWriteOperation> = []
	const sourceRows = rows ?? [{ ...sourceRow(shippingMethod), shipping_destination: shippingDestination }]
	let requestNumber = 0
	const pool = {
		request: () => {
			const queryRows = requestNumber++ === 0 ? sourceRows.map(({ po }) => ({ po, outbound_qty: 1 })) : sourceRows
			return {
				input: () => undefined,
				toReadableStream: () => Readable.from(queryRows),
				query: async () => undefined,
				cancel: () => true
			}
		}
	}
	const database = {
		collection: () => ({
			createIndex: async () => undefined,
			bulkWrite: async (operations: Array<mongo.AnyBulkWriteOperation>) => {
				writes.push(...operations)
				return { isOk: () => true }
			}
		})
	} as unknown as mongo.Db
	return { pool, database, writes }
}

describe('runPurchaseOrderStep', () => {
	it('completes absent UGG and all non-UGG orders per size, preserving active UGG progress', async () => {
		const rows = [
			{ ...sourceRow('AIR'), po: 'ACTIVE' },
			{
				...sourceRow('AIR'),
				po: 'ABSENT',
				shipping_progress: '{"7":{"order_qty":5,"shipped_out_qty":2},"8":{"order_qty":3,"shipped_out_qty":4}}'
			},
			{ ...sourceRow('AIR'), po: 'OTHER', brand_name: 'OTHER' }
		]
		const { database, writes } = setup('AIR')
		const queries: string[] = []
		let requestNumber = 0
		const pool = {
			request: () => {
				const source =
					requestNumber++ === 0
						? [
								{ po: ' ACTIVE ', outbound_qty: 2 },
								{ po: 'OTHER', outbound_qty: 1 }
							]
						: rows
				return {
					input: () => undefined,
					toReadableStream: () => Readable.from(source),
					query: async (sql: string) => {
						queries.push(sql)
					},
					cancel: () => true
				}
			}
		}
		await runPurchaseOrderStep(pool, database, cutoff)
		const progress = (po: string) =>
			writes.find((op) => op.updateOne?.filter.po === po)?.updateOne?.update.$set?.shipping_progress
		expect(progress('ACTIVE')).toEqual({ '7': { order_qty: 5, shipped_out_qty: 2 } })
		expect(progress('ABSENT')).toEqual({
			'7': { order_qty: 5, shipped_out_qty: 5 },
			'8': { order_qty: 3, shipped_out_qty: 3 }
		})
		expect(progress('OTHER')).toEqual({ '7': { order_qty: 5, shipped_out_qty: 5 } })
		expect(queries[0]).toMatch(/dvview_invoub/i)
		expect(queries[0]).toMatch(/brand_name\s*=\s*'UGG'/i)
		expect(queries[0]).toMatch(/inv_sizes\s+IS\s+NOT\s+NULL/i)
		expect(queries[0]).toMatch(/inv_sizes\s*<>\s*'NULL'/i)
	})

	it('marks UGG orders complete when the outstanding PO list is empty', async () => {
		const { database, writes } = setup('AIR')
		let requestNumber = 0
		const pool = {
			request: () => {
				const rows = requestNumber++ === 0 ? [] : [sourceRow('AIR')]
				return {
					input: () => undefined,
					toReadableStream: () => Readable.from(rows),
					query: async () => undefined,
					cancel: () => true
				}
			}
		}
		await runPurchaseOrderStep(pool, database, cutoff)
		expect(writes[0].updateOne?.update.$set?.shipping_progress).toEqual({
			'7': { order_qty: 5, shipped_out_qty: 5 }
		})
	})

	it('does not write purchase orders when the outstanding PO query fails', async () => {
		const { database, writes } = setup('AIR')
		const pool = {
			request: () => ({
				input: () => undefined,
				toReadableStream: () => Readable.from([]),
				query: async () => {
					throw new Error('source unavailable')
				},
				cancel: () => true
			})
		}
		await expect(runPurchaseOrderStep(pool, database, cutoff)).rejects.toThrow('source unavailable')
		expect(writes).toHaveLength(0)
	})

	it('rejects invalid outstanding PO rows before writing orders', async () => {
		const { database, writes } = setup('AIR')
		const pool = {
			request: () => ({
				input: () => undefined,
				toReadableStream: () => Readable.from([{ po: null, outbound_qty: 0 }]),
				query: async () => undefined,
				cancel: () => true
			})
		}
		await expect(runPurchaseOrderStep(pool, database, cutoff)).rejects.toThrow('Invalid purchase order po')
		expect(writes).toHaveLength(0)
	})

	it('upserts duplicate POs and does not overwrite non-null shipping fields across batches', async () => {
		const first = sourceRow('AIR')
		const fillers = Array.from({ length: 99 }, (_, index) => ({ ...sourceRow('AIR'), po: `FILL${index}` }))
		const last = {
			...sourceRow(null),
			po: first.po,
			shipping_destination: null,
			packing: '{"14DEF":{"8":3}}'
		}
		const { pool, database, writes } = setup('AIR', 'US', [first, ...fillers, last])
		expect(await runPurchaseOrderStep(pool, database, cutoff)).toEqual({ purchaseOrders: 100 })
		const updates = writes.filter((op) => op.updateOne?.filter.po === first.po).map((op) => op.updateOne!.update)
		expect(updates).toHaveLength(2)
		expect(updates[0]).toMatchObject({ $set: { shipping_method: 'AIR', shipping_destination: 'US' } })
		expect(updates[1]).toMatchObject({ $set: { packing: { '14DEF': { '8': 3 } } } })
		expect(updates[1].$set).not.toHaveProperty('shipping_method')
		expect(updates[1].$set).not.toHaveProperty('shipping_destination')
	})

	it.each([null, 'AIR', 'OCEAN'])('stores shipping method %s', async (method) => {
		const { pool, database, writes } = setup(method)
		expect(await runPurchaseOrderStep(pool, database, cutoff)).toEqual({ purchaseOrders: 1 })
		const update = writes[0].updateOne!.update
		expect(method === null ? update.$setOnInsert : update.$set).toMatchObject({ shipping_method: method })
		if (method === null) expect(update.$set).not.toHaveProperty('shipping_method')
	})

	it('rejects unknown shipping methods', async () => {
		const { pool, database, writes } = setup('RAIL')
		await expect(runPurchaseOrderStep(pool, database, cutoff)).rejects.toThrow('Invalid shipping method')
		expect(writes).toHaveLength(0)
	})

	it.each([
		[null, null],
		[' US ', 'US']
	])('stores shipping destination %s', async (source, expected) => {
		const { pool, database, writes } = setup('AIR', source)
		expect(await runPurchaseOrderStep(pool, database, cutoff)).toEqual({ purchaseOrders: 1 })
		const update = writes[0].updateOne!.update
		expect(source === null ? update.$setOnInsert : update.$set).toMatchObject({ shipping_destination: expected })
		if (source === null) expect(update.$set).not.toHaveProperty('shipping_destination')
	})

	it.each([42, '', '  '])('rejects invalid shipping destination %s', async (destination) => {
		const { pool, database, writes } = setup('AIR', destination)
		await expect(runPurchaseOrderStep(pool, database, cutoff)).rejects.toThrow(
			'Invalid purchase order shipping_destination'
		)
		expect(writes).toHaveLength(0)
	})

	it('allows a null shipping method in the purchase order schema', () => {
		const model =
			mongoose.models.WarehouseSyncPurchaseOrderTest ??
			mongoose.model('WarehouseSyncPurchaseOrderTest', PurchaseOrderSchema)
		const order = new model({
			...sourceRow(null),
			packing: { '14ABC': { '7': 5 } },
			shipping_progress: { '7': { order_qty: 5, shipped_out_qty: 2 } }
		})
		expect(order.validateSync()).toBeUndefined()
	})
})
