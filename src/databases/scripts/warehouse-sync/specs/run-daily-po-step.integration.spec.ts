import mongoose from 'mongoose'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { runDailyPoStep } from '../run-daily-po-step'

const uri = process.env.WAREHOUSE_SYNC_TEST_MONGO_URI
const integration = uri ? describe : describe.skip

integration('runDailyPoStep', () => {
	it('maps SQL rows and writes the grouped result into MongoDB', async () => {
		const client = new mongoose.mongo.MongoClient(uri)
		const databaseName = `warehouse_sync_test_${randomUUID().replaceAll('-', '')}`
		let connected = false
		try {
			await client.connect()
			connected = true
			const database = client.db(databaseName)
			await database.collection('manufacturing_orders').insertOne({ mo_no: '14001' })
			await database.collection('purchase_orders').insertOne({ po: 'PO1' })
			const parameters: Record<string, string> = {}
			const pool = {
				request: () => ({
					input: (name: string, value: string) => {
						parameters[name] = value
					},
					toReadableStream: () =>
						Readable.from([
							{ po: 'PO1', date: '2026-11-10', time: '10:24', mo_no: '14001', size: '08', quantity: -2 }
						]),
					query: async () => undefined,
					cancel: () => true
				})
			}
			expect(await runDailyPoStep(pool, database, 'GL3', () => '123456', new Date('2026-11-11T17:00:00Z'))).toEqual({
				scans: 1,
				documents: 1,
				quantity: 2
			})
			expect(parameters).toMatchObject({ tenant: 'GL3', cutoff: '2026-11-12' })
			expect(
				(await database.collection('daily_po_shipping_progress').findOne({ po: 'PO1' })).shipping_progress
			).toEqual({
				'14001': { '08': 2 }
			})
		} finally {
			if (connected) await client.db(databaseName).dropDatabase()
			await client.close()
		}
	})
})
