import mongoose from 'mongoose'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { runManufacturingOrderStep } from '../run-manufacturing-order-step'

const uri = process.env.WAREHOUSE_SYNC_TEST_MONGO_URI
const integration = uri ? describe : describe.skip

integration('runManufacturingOrderStep', () => {
	it('streams eligible orders without a prefix parameter and preserves IDs', async () => {
		const client = new mongoose.mongo.MongoClient(uri)
		const databaseName = `warehouse_sync_test_${randomUUID().replaceAll('-', '')}`
		let connected = false
		try {
			await client.connect()
			connected = true
			const database = client.db(databaseName)
			const requests: Record<string, string>[] = []
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
							requests.push({ ...parameters })
							cutoffParameters.push(parameters.cutoff)
							return Readable.from([
								{
									mo_no: '14ABC',
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
							queries.push(sql)
						},
						cancel: () => true
					}
				}
			}
			const cutoff = new Date('2026-11-11T17:00:00Z')
			expect(await runManufacturingOrderStep(pool, database, 'VB2', cutoff)).toEqual({
				manufacturingOrders: 1
			})
			expect(requests).toEqual([{ FactoryCode: 'VB2', cutoff: '2026-11-12' }])
			expect(cutoffParameters).toEqual(['2026-11-12'])
			expect(queries[0].match(/record_time\s*<\s*@cutoff/g)).toHaveLength(2)
			expect(queries[0]).toMatch(/TRY_CONVERT\(int,\s*LEFT\(a\.mo_no,\s*2\)\)\s*>=\s*14/i)
			const collection = database.collection('manufacturing_orders')
			const first = await collection.findOne({ mo_no: '15ABC' })
			expect(first.size_ledger['7']).toMatchObject({ order_qty: 5, stocked_in_qty: 2 })
			expect(first.search_ngrams).toEqual(expect.arrayContaining(['14', 'abc']))
			await runManufacturingOrderStep(pool, database, 'VB2', cutoff)
			expect(await collection.countDocuments()).toBe(1)
			expect((await collection.findOne({ mo_no: '15ABC' }))._id).toEqual(first._id)
		} finally {
			if (connected) await client.db(databaseName).dropDatabase()
			await client.close()
		}
	})
})
