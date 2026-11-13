import { compare } from 'bcrypt'
import mongoose from 'mongoose'
import { randomUUID } from 'node:crypto'
import { syncMongoUsers } from '../mongo-users'

const uri = process.env.WAREHOUSE_SYNC_TEST_MONGO_URI
const integration = uri ? describe : describe.skip

integration('syncMongoUsers', () => {
	it('hashes source passwords and retains existing identity and hash on rerun', async () => {
		const client = new mongoose.mongo.MongoClient(uri)
		const databaseName = `warehouse_sync_test_${randomUUID().replaceAll('-', '')}`
		let connected = false
		try {
			await client.connect()
			connected = true
			const database = client.db(databaseName)
			const rows = [
				{ username: 'quanghiep', password: 'test-password', email: 'test@example.invalid', display_name: 'Test' }
			]
			expect(await syncMongoUsers(database, rows, 4)).toEqual({ users: 1 })
			const first = await database.collection('users').findOne({ username: 'quanghiep' })
			expect(first.is_system_user).toBe(true)
			expect(await compare('test-password', first.password)).toBe(true)
			await syncMongoUsers(database, rows, 4)
			const second = await database.collection('users').findOne({ username: 'quanghiep' })
			expect(second._id).toEqual(first._id)
			expect(second.password).toBe(first.password)
		} finally {
			if (connected) await client.db(databaseName).dropDatabase()
			await client.close()
		}
	})

	it('rejects invalid source rows without creating an account', async () => {
		const client = new mongoose.mongo.MongoClient(uri)
		const databaseName = `warehouse_sync_test_${randomUUID().replaceAll('-', '')}`
		let connected = false
		try {
			await client.connect()
			connected = true
			const database = client.db(databaseName)
			await expect(
				syncMongoUsers(database, [{ username: '', password: 'test', email: null, display_name: 'Test' }], 4)
			).rejects.toThrow(/username/i)
			expect(await database.collection('users').countDocuments()).toBe(0)
		} finally {
			if (connected) await client.db(databaseName).dropDatabase()
			await client.close()
		}
	})
})
