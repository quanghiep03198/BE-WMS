import mongoose from 'mongoose'
import { randomUUID } from 'node:crypto'
import { syncMongoWarehouses } from '../mongo-warehouses'

const uri = process.env.WAREHOUSE_SYNC_TEST_MONGO_URI
const integration = uri ? describe : describe.skip

integration('syncMongoWarehouses', () => {
	it('uses warehouse capacity and resolves users with the specified fallback on rerun', async () => {
		const client = new mongoose.mongo.MongoClient(uri)
		const databaseName = `warehouse_sync_test_${randomUUID().replaceAll('-', '')}`
		let connected = false
		try {
			await client.connect()
			connected = true
			const database = client.db(databaseName)
			const fallback = new mongoose.Types.ObjectId()
			const creator = new mongoose.Types.ObjectId()
			await database.collection('users').insertMany([
				{ _id: fallback, username: 'quanghiep' },
				{ _id: creator, username: 'creator' }
			])
			const date = new Date('2026-01-01T00:00:00Z')
			const warehouses = [{ code: 'W1', name: ' kho 1 ', capacity: 42, created_at: date, creator: 'unknown' }]
			const locations = [
				{ warehouse_code: 'W1', storage_num: 'S01', name: ' A01 ', created_at: date, creator: 'creator' },
				{ warehouse_code: 'W1', storage_num: 'S02', name: 'A02', created_at: date, creator: null }
			]
			expect(await syncMongoWarehouses(database, warehouses, locations, 'quanghiep')).toEqual({
				warehouses: 1,
				storageLocations: 2,
				fallbackUsers: 2
			})
			const first = await database.collection('warehouses').findOne({ code: 'W1' })
			expect(first).toMatchObject({ name: 'KHO 1', code: 'W1', capacity: 42, created_by: fallback })
			expect(await database.collection('storage_locations').findOne({ name: 'A01' })).toMatchObject({
				warehouse: first._id,
				created_by: creator,
				storage_num: 'S01'
			})
			expect(await database.collection('storage_locations').findOne({ name: 'A02' })).toMatchObject({
				warehouse: first._id,
				created_by: fallback,
				storage_num: 'S02'
			})
			locations[0].storage_num = 'S03'
			await syncMongoWarehouses(database, warehouses, locations, 'quanghiep')
			expect((await database.collection('warehouses').findOne({ code: 'W1' }))._id).toEqual(first._id)
			expect(await database.collection('storage_locations').countDocuments()).toBe(2)
			expect(await database.collection('storage_locations').findOne({ name: 'A01' })).toMatchObject({ storage_num: 'S03' })
		} finally {
			if (connected) await client.db(databaseName).dropDatabase()
			await client.close()
		}
	})

	it('rejects a missing fallback user before writing any warehouses', async () => {
		const client = new mongoose.mongo.MongoClient(uri)
		const databaseName = `warehouse_sync_test_${randomUUID().replaceAll('-', '')}`
		let connected = false
		try {
			await client.connect()
			connected = true
			const database = client.db(databaseName)
			await expect(
				syncMongoWarehouses(
					database,
					[{ code: 'W1', name: 'KHO 1', capacity: 42, created_at: new Date(), creator: null }],
					[],
					'quanghiep'
				)
			).rejects.toThrow(/fallback user/i)
			expect(await database.collection('warehouses').countDocuments()).toBe(0)
		} finally {
			if (connected) await client.db(databaseName).dropDatabase()
			await client.close()
		}
	})

	it('keeps an existing location in another warehouse with the same name', async () => {
		const client = new mongoose.mongo.MongoClient(uri)
		const databaseName = `warehouse_sync_test_${randomUUID().replaceAll('-', '')}`
		let connected = false
		try {
			await client.connect()
			connected = true
			const database = client.db(databaseName)
			await database.collection('users').insertOne({ username: 'quanghiep' })
			await database.collection('storage_locations').createIndex({ name: 1 }, { unique: true })
			const otherWarehouse = new mongoose.Types.ObjectId()
			await database.collection('warehouses').insertOne({ _id: otherWarehouse, code: 'OTHER', name: 'OTHER' })
			await database.collection('storage_locations').insertOne({ name: 'A01', warehouse: otherWarehouse })
			const date = new Date()
			await expect(
				syncMongoWarehouses(
					database,
					[{ code: 'W1', name: 'KHO', capacity: 42, created_at: date, creator: null }],
					[{ warehouse_code: 'W1', storage_num: 'S01', name: 'A01', created_at: date, creator: null }],
					'quanghiep'
				)
			).resolves.toMatchObject({ storageLocations: 1 })
			expect(await database.collection('storage_locations').countDocuments({ name: 'A01' })).toBe(2)
			expect(await database.collection('storage_locations').countDocuments({ name: 'A01', warehouse: otherWarehouse })).toBe(1)
			const indexes = await database.collection('storage_locations').listIndexes().toArray()
			expect(indexes.some((index) => index.name === 'name_1')).toBe(false)
			expect(indexes).toEqual(expect.arrayContaining([
				expect.objectContaining({ key: { warehouse: 1, name: 1 }, unique: true })
			]))
			await expect(database.collection('storage_locations').insertOne({ name: 'A01', warehouse: otherWarehouse }))
				.rejects.toThrow()
		} finally {
			if (connected) await client.db(databaseName).dropDatabase()
			await client.close()
		}
	})
})
