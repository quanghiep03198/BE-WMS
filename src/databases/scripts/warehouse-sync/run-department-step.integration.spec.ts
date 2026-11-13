import mongoose from 'mongoose'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { runDepartmentStep } from './run-department-step'

const uri = process.env.WAREHOUSE_SYNC_TEST_MONGO_URI
const integration = uri ? describe : describe.skip

integration('runDepartmentStep', () => {
	it('writes localized department names using the supplied factory code', async () => {
		const client = new mongoose.mongo.MongoClient(uri)
		const databaseName = `warehouse_sync_test_${randomUUID().replaceAll('-', '')}`
		let connected = false
		try {
			await client.connect()
			connected = true
			const database = client.db(databaseName)
			let factory = ''
			const pool = {
				request: () => ({
					input: (_name: string, value: string) => {
						factory = value
					},
					toReadableStream: () => Readable.from([{ group: 'ASBL', code: 'VB2BA01', name: '成型A線' }]),
					query: async () => undefined,
					cancel: () => true
				})
			}
			expect(await runDepartmentStep(pool, database, 'VB2')).toEqual({ departments: 1 })
			expect(factory).toBe('VB2')
			expect(await database.collection('departments').findOne({ code: 'VB2BA01' })).toMatchObject({
				group: 'ASBL',
				name: { cn: '成型A', en: 'Assembly A', vi: 'Thành hình A' }
			})
		} finally {
			if (connected) await client.db(databaseName).dropDatabase()
			await client.close()
		}
	})
})
