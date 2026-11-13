import mongoose from 'mongoose'
import { randomUUID } from 'node:crypto'
import { runWarehouseStep } from '../run-warehouse-step'

const uri = process.env.WAREHOUSE_SYNC_TEST_MONGO_URI
const integration = uri ? describe : describe.skip

integration('runWarehouseStep', () => {
	it('loads source rows using the factory code and writes referenced warehouses and locations', async () => {
		const client = new mongoose.mongo.MongoClient(uri)
		const databaseName = `warehouse_sync_test_${randomUUID().replaceAll('-', '')}`
		let connected = false
		try {
			await client.connect()
			connected = true
			const database = client.db(databaseName)
			await database.collection('users').insertOne({ username: 'quanghiep' })
			const date = new Date('2026-01-01T00:00:00Z')
			const params: string[] = []
			let requestCount = 0
			const pool = {
				request: () => {
					const index = requestCount++
					return {
						input: (_name: string, value: string) => {
							params.push(value)
						},
						query: async () => ({
							recordset:
								index === 0
									? [{ code: 'W1', name: 'KHO', capacity: 6, created_at: date, creator: null }]
									: [{ warehouse_code: 'W1', storage_num: 'S01', name: 'A01', created_at: date, creator: null }]
						})
					}
				}
			}
			expect(await runWarehouseStep(pool, database, 'VB2', 'quanghiep')).toEqual({
				warehouses: 1,
				storageLocations: 1,
				fallbackUsers: 2
			})
			expect(params).toEqual(['VB2', 'VB2'])
			expect((await database.collection('warehouses').findOne({ code: 'W1' })).capacity).toBe(6)
		} finally {
			if (connected) await client.db(databaseName).dropDatabase()
			await client.close()
		}
	})
})
