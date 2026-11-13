import mongoose from 'mongoose'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { runEpcMatchStep } from '../run-epc-match-step'

const uri = process.env.WAREHOUSE_SYNC_TEST_MONGO_URI
const integration = uri ? describe : describe.skip

integration('runEpcMatchStep', () => {
	it('only queries imported MOs and preserves EPC IDs when rerun', async () => {
		const client = new mongoose.mongo.MongoClient(uri)
		const databaseName = `warehouse_sync_test_${randomUUID().replaceAll('-', '')}`
		let connected = false
		try {
			await client.connect()
			connected = true
			const database = client.db(databaseName)
			await database.collection('manufacturing_orders').insertMany([{ mo_no: '14ABC' }, { mo_no: '15ABC' }])
			const parametersSeen: string[][] = []
			const pool = {
				request: () => {
					const parameters: string[] = []
					return {
						input: (_name: string, value: string) => {
							parameters.push(value)
						},
						toReadableStream: () => {
							parametersSeen.push([...parameters])
							return Readable.from([
								{
									epc: 'EPC1',
									mo_no: '14ABC',
									factory_shoes_style: 'F1',
									cust_shoes_style: 'C1',
									factory_code_produce: 'VB2',
									size_numcode: '7',
									color_sn: 'BLACK'
								}
							])
						},
						query: async () => undefined,
						cancel: () => true
					}
				}
			}
			expect(await runEpcMatchStep(pool, database)).toEqual({ epcMatches: 1 })
			expect(parametersSeen[0].sort()).toEqual(['14ABC', '15ABC'])
			const collection = database.collection('finished_goods_epcs_match')
			const first = await collection.findOne({ epc: 'EPC1' })
			expect(first).toMatchObject({ mo_no: '14ABC', size_numcode: '7', color_sn: 'BLACK' })
			await runEpcMatchStep(pool, database)
			expect(await collection.countDocuments()).toBe(1)
			expect((await collection.findOne({ epc: 'EPC1' }))._id).toEqual(first._id)
		} finally {
			if (connected) await client.db(databaseName).dropDatabase()
			await client.close()
		}
	})
})
