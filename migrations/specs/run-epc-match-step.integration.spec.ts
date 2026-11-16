import mongoose from 'mongoose'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { runEpcMatchStep } from '../commands/run-epc-match-step'

const uri = process.env.WAREHOUSE_SYNC_TEST_MONGO_URI
const integration = uri ? describe : describe.skip

integration('runEpcMatchStep', () => {
	it('allows explicit insert mode only for an empty target', async () => {
		const client = new mongoose.mongo.MongoClient(uri)
		const databaseName = `warehouse_sync_test_${randomUUID().replaceAll('-', '')}`
		let connected = false
		const info = jest.spyOn(console, 'info').mockImplementation(() => {})
		try {
			await client.connect()
			connected = true
			const database = client.db(databaseName)
			await database.collection('manufacturing_orders').insertOne({ mo_no: '14ABC' })
			const pool = {
				request: () => ({
					input: () => undefined,
					toReadableStream: () =>
						Readable.from([
							{
								epc: 'EPC1',
								mo_no: '14ABC',
								factory_shoes_style: 'F1',
								cust_shoes_style: 'C1',
								factory_code_produce: 'VB2',
								size_numcode: '7',
								color_sn: 'BLACK'
							}
						]),
					query: async () => undefined,
					cancel: () => true
				})
			}
			await expect(runEpcMatchStep(pool, database, { writeMode: 'insert' })).resolves.toEqual({ epcMatches: 1 })
			expect(await database.collection('finished_goods_epcs_match').countDocuments()).toBe(1)
			await expect(runEpcMatchStep(pool, database, { writeMode: 'insert' })).rejects.toThrow(/empty/i)
			await expect(runEpcMatchStep(pool, database)).resolves.toEqual({ epcMatches: 1 })
		} finally {
			info.mockRestore()
			if (connected) await client.db(databaseName).dropDatabase()
			await client.close()
		}
	})

	it('rejects duplicate EPCs across batches and permits a later retry', async () => {
		const client = new mongoose.mongo.MongoClient(uri)
		const databaseName = `warehouse_sync_test_${randomUUID().replaceAll('-', '')}`
		let connected = false
		const info = jest.spyOn(console, 'info').mockImplementation(() => {})
		const error = jest.spyOn(console, 'error').mockImplementation(() => {})
		try {
			await client.connect()
			connected = true
			const database = client.db(databaseName)
			await database.collection('manufacturing_orders').insertOne({ mo_no: '14ABC' })
			let epcs = ['EPC1', 'EPC2', 'EPC1']
			const pool = {
				request: () => ({
					input: () => undefined,
					toReadableStream: () =>
						Readable.from(
							epcs.map((epc) => ({
								epc,
								mo_no: '14ABC',
								factory_shoes_style: 'F1',
								cust_shoes_style: 'C1',
								factory_code_produce: 'VB2',
								size_numcode: '7',
								color_sn: 'BLACK'
							}))
						),
					query: async () => undefined,
					cancel: () => true
				})
			}
			const options = { batchSize: 2, concurrency: 2 }
			await expect(runEpcMatchStep(pool, database, options)).rejects.toThrow(/duplicate|E11000/i)
			epcs = ['EPC1', 'EPC2']
			await expect(runEpcMatchStep(pool, database, options)).resolves.toEqual({ epcMatches: 2 })
			expect(await database.collection('finished_goods_epcs_match').countDocuments()).toBe(2)
		} finally {
			info.mockRestore()
			error.mockRestore()
			if (connected) await client.db(databaseName).dropDatabase()
			await client.close()
		}
	})

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
