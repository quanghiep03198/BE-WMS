import { compare } from 'bcrypt'
import mongoose from 'mongoose'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { runUserStep } from './run-user-step'

const uri = process.env.WAREHOUSE_SYNC_TEST_MONGO_URI
const integration = uri ? describe : describe.skip

integration('runUserStep', () => {
	it('keeps the first duplicate source account and preserves its MongoDB identity on rerun', async () => {
		const client = new mongoose.mongo.MongoClient(uri)
		const databaseName = `warehouse_sync_test_${randomUUID().replaceAll('-', '')}`
		let connected = false
		try {
			await client.connect()
			connected = true
			const database = client.db(databaseName)
			const query = jest.fn(async () => undefined)
			const pool = {
				request: () => ({
					input: () => undefined,
					toReadableStream: () =>
						Readable.from([
							{ username: 'quanghiep', password: 'test-password', email: null, display_name: 'Test' },
							{ username: 'quanghiep', password: 'other-password', email: null, display_name: 'Duplicate' }
						]),
					query,
					cancel: () => true
				})
			}
			expect(await runUserStep(pool, database, 4)).toEqual({ users: 1 })
			expect(query).toHaveBeenCalledWith(expect.stringMatching(/\bb\.email\b/))
			const account = await database.collection('users').findOne({ username: 'quanghiep' })
			expect(await compare('test-password', account.password)).toBe(true)
			expect(account.is_system_user).toBe(true)
			expect(account.display_name).toBe('Test')
			expect(await runUserStep(pool, database, 4)).toEqual({ users: 1 })
			const rerunAccount = await database.collection('users').findOne({ username: 'quanghiep' })
			expect(rerunAccount._id).toEqual(account._id)
			expect(rerunAccount.password).toBe(account.password)
			expect(await database.collection('users').countDocuments({ username: 'quanghiep' })).toBe(1)
		} finally {
			if (connected) await client.db(databaseName).dropDatabase()
			await client.close()
		}
	})
})
