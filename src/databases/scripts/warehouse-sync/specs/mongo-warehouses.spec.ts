import { Types, type mongo } from 'mongoose'
import { syncMongoWarehouses } from '../mongo-warehouses'

describe('syncMongoWarehouses', () => {
	it('keeps the lowest source number within each warehouse and permits equal names across warehouses', async () => {
		const userId = new Types.ObjectId()
		const creatorId = new Types.ObjectId()
		const ids = { W1: new Types.ObjectId(), W2: new Types.ObjectId() }
		const updates: Array<{ filter: { name: string; warehouse: Types.ObjectId }; update: { $set: { created_by: Types.ObjectId; storage_num: string } } }> = []
		const collections = {
			users: { find: () => ({ toArray: async () => [{ _id: userId, username: 'fallback' }, { _id: creatorId, username: 'preferred' }] }) },
			warehouses: {
				createIndex: async () => undefined,
				find: () => ({ toArray: async () => Object.entries(ids).map(([code, _id]) => ({ code, _id })) }),
				bulkWrite: async () => ({ isOk: () => true })
			},
			storage_locations: {
				listIndexes: () => ({ toArray: async () => [{ name: '_id_', key: { _id: 1 } }, { name: 'name_1', key: { name: 1 }, unique: true }] }),
				dropIndex: jest.fn(async () => undefined),
				createIndex: jest.fn(async () => undefined),
				bulkWrite: async (operations: Array<{ updateOne: typeof updates[number] }>) => {
					updates.push(...operations.map(({ updateOne }) => updateOne))
					return { isOk: () => true }
				}
			}
		}
		const database = { collection: (name: keyof typeof collections) => collections[name] } as unknown as mongo.Db
		const date = new Date('2026-01-01T00:00:00Z')
		const warehouses = ['W1', 'W2'].map((code) => ({ code, name: code, capacity: 1, created_at: date, creator: null }))
		const locations = [
			{ warehouse_code: 'W1', name: 'A01', storage_num: '02', created_at: date, creator: null },
			{ warehouse_code: 'W2', name: 'A01', storage_num: '03', created_at: date, creator: null },
			{ warehouse_code: 'W1', name: ' a01 ', storage_num: '01', created_at: date, creator: 'preferred' }
		]
		expect(await syncMongoWarehouses(database, warehouses, locations, 'fallback')).toMatchObject({ storageLocations: 2 })
		expect(updates.map(({ filter }) => filter)).toEqual([
			{ name: 'A01', warehouse: ids.W1 }, { name: 'A01', warehouse: ids.W2 }
		])
		expect(updates[0].update.$set.created_by).toEqual(creatorId)
		expect(updates.map(({ update }) => update.$set.storage_num)).toEqual(['01', '03'])
		expect(collections.storage_locations.dropIndex).toHaveBeenCalledWith('name_1')
		expect(collections.storage_locations.createIndex).toHaveBeenCalledWith({ warehouse: 1, name: 1 }, { unique: true })
	})
})
