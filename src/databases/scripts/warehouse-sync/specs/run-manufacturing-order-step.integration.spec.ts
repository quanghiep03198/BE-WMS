import mongoose from 'mongoose'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { runManufacturingOrderStep } from '../run-manufacturing-order-step'

const uri = process.env.WAREHOUSE_SYNC_TEST_MONGO_URI
const integration = uri ? describe : describe.skip

integration('runManufacturingOrderStep', () => {
	it('streams the requested prefix and stores searchable orders without changing IDs', async () => {
		const client = new mongoose.mongo.MongoClient(uri)
		const databaseName = `warehouse_sync_test_${randomUUID().replaceAll('-', '')}`
		let connected = false
		try {
			await client.connect()
			connected = true
			const database = client.db(databaseName)
			const requestedPrefixes: string[] = []
			const cutoffParameters: string[] = []
			const queries: string[] = []
			const pool = {
				request: () => {
					const parameters: Record<string, string> = {}
					return {
						input: (name: string, value: string) => {
							parameters[name] = value
						},
						toReadableStream: () => {
							requestedPrefixes.push(parameters.MoPrefix)
							cutoffParameters.push(parameters.cutoff)
							return Readable.from([
								{
									mo_no: `${parameters.MoPrefix}ABC`,
									brand_name: 'UGG',
									factory_code_produce: 'VB2',
									factory_shoes_style: 'F1',
									cust_shoes_style: 'C1',
									color_sn: 'BLACK',
									order_qty: 5,
									size_ledger: JSON.stringify({
										'7': {
											order_qty: 5,
											stocked_in_qty: 2,
											total_recall_tx: 0,
											total_return_tx: 0,
											shipped_out_qty: 1
										}
									})
								}
							])
						},
						query: async (sql: string) => {
							if (parameters.MoPrefix) queries.push(sql)
						},
						cancel: () => true
					}
				}
			}
			const cutoff = new Date('2026-11-11T17:00:00Z')
			expect(await runManufacturingOrderStep(pool, database, 'VB2', cutoff, '15')).toEqual({
				manufacturingOrders: 1
			})
			expect(requestedPrefixes).toEqual(['15'])
			expect(cutoffParameters).toEqual(['2026-11-12'])
			expect(queries[0].match(/record_time\s*<\s*@cutoff/g)).toHaveLength(2)
			const collection = database.collection('manufacturing_orders')
			const first = await collection.findOne({ mo_no: '15ABC' })
			expect(first.size_ledger['7']).toMatchObject({ order_qty: 5, stocked_in_qty: 2 })
			expect(first.search_ngrams).toEqual(expect.arrayContaining(['15', 'abc']))
			await runManufacturingOrderStep(pool, database, 'VB2', cutoff, '15')
			expect(await collection.countDocuments()).toBe(1)
			expect((await collection.findOne({ mo_no: '15ABC' }))._id).toEqual(first._id)
		} finally {
			if (connected) await client.db(databaseName).dropDatabase()
			await client.close()
		}
	})
})
