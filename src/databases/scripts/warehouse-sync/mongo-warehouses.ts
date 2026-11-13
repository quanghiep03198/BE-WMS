import { type mongo } from 'mongoose'

export interface WarehouseSource {
	code: string
	name: string
	capacity: number
	created_at: Date
	creator: string | null
}

export interface StorageLocationSource {
	warehouse_code: string
	storage_num: string
	name: string
	created_at: Date
	creator: string | null
}

export async function syncMongoWarehouses(
	database: mongo.Db,
	warehouseRows: readonly WarehouseSource[],
	locationRows: readonly StorageLocationSource[],
	fallbackUsername: string
): Promise<{ warehouses: number; storageLocations: number; fallbackUsers: number }> {
	function text(value: string, field: string): string {
		if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid ${field}`)
		return value.trim().toUpperCase()
	}
	function date(value: Date, field: string): Date {
		if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error(`Invalid ${field} timestamp`)
		return value
	}
	function capacity(value: number): number {
		if (!Number.isFinite(value)) throw new Error('Invalid warehouse capacity')
		return value
	}

	const warehouses = warehouseRows.map((row) => ({
		code: text(row.code, 'warehouse code'),
		name: text(row.name, 'warehouse name'),
		capacity: capacity(row.capacity),
		created_at: date(row.created_at, 'warehouse'),
		creator: row.creator?.trim()
	}))
	const sourceLocations = locationRows.map((row) => ({
		warehouse_code: text(row.warehouse_code, 'storage warehouse code'),
		storage_num: text(row.storage_num, 'storage number'),
		name: text(row.name, 'storage name'),
		created_at: date(row.created_at, 'storage'),
		creator: row.creator?.trim()
	}))
	const uniqueCodes = new Set(warehouses.map((row) => row.code))
	if (uniqueCodes.size !== warehouses.length) throw new Error('Duplicate warehouse code')
	if (new Set(warehouses.map((row) => row.name)).size !== warehouses.length) {
		throw new Error('Duplicate warehouse name')
	}
	const uniqueLocations = new Map<string, (typeof sourceLocations)[number]>()
	for (const location of sourceLocations) {
		if (!uniqueCodes.has(location.warehouse_code)) throw new Error(`Unknown warehouse ${location.warehouse_code}`)
		const key = JSON.stringify([location.warehouse_code, location.name])
		const previous = uniqueLocations.get(key)
		if (!previous || location.storage_num < previous.storage_num) uniqueLocations.set(key, location)
		else if (
			location.storage_num === previous.storage_num &&
			(location.created_at.getTime() !== previous.created_at.getTime() || location.creator !== previous.creator)
		) {
			throw new Error(`Conflicting storage number ${location.storage_num} in warehouse ${location.warehouse_code}`)
		}
	}
	const locations = [...uniqueLocations.values()]

	const users = database.collection<{ username: string }>('users')
	const usernames = new Set(
		[fallbackUsername, ...warehouses.map((row) => row.creator), ...locations.map((row) => row.creator)].filter(
			(username): username is string => Boolean(username)
		)
	)
	const userRows = await users.find({ username: { $in: [...usernames] } }).toArray()
	const usersByName = new Map(userRows.map((user) => [user.username, user._id]))
	const fallback = usersByName.get(fallbackUsername)
	if (!fallback) throw new Error(`Missing fallback user ${fallbackUsername}`)
	let fallbackUsers = 0
	function creatorId(username: string | undefined) {
		const id = username ? usersByName.get(username) : undefined
		if (id) return id
		fallbackUsers++
		return fallback
	}

	const warehouseCollection = database.collection('warehouses')
	const locationCollection = database.collection('storage_locations')
	await warehouseCollection.createIndex({ name: 1 }, { unique: true })
	await locationCollection.createIndex({ warehouse: 1, name: 1 }, { unique: true })
	const indexes = await locationCollection.listIndexes().toArray()
	for (const index of indexes) {
		if (index.unique && Object.keys(index.key).length === 1 && index.key.name === 1) {
			await locationCollection.dropIndex(index.name)
		}
	}
	const existing = await warehouseCollection.find({ code: { $in: [...uniqueCodes] } }).toArray()
	const existingCodes = existing.map((warehouse) => warehouse.code)
	if (new Set(existingCodes).size !== existingCodes.length) throw new Error('Duplicate existing warehouse code')
	const now = new Date()
	if (warehouses.length) {
		await warehouseCollection.bulkWrite(
			warehouses.map((row) => ({
				updateOne: {
					filter: { code: row.code },
					update: {
						$set: {
							name: row.name,
							capacity: row.capacity,
							created_by: creatorId(row.creator),
							updated_at: now
						},
						$setOnInsert: { created_at: row.created_at, deleted: false }
					},
					upsert: true
				}
			}))
		)
	}
	const stored = await warehouseCollection.find({ code: { $in: [...uniqueCodes] } }).toArray()
	const warehouseIds = new Map(stored.map((warehouse) => [warehouse.code, warehouse._id]))
	if (warehouseIds.size !== warehouses.length) throw new Error('Failed to resolve imported warehouses')
	if (locations.length) {
		const result = await locationCollection.bulkWrite(
			locations.map((row) => {
				const warehouse = warehouseIds.get(row.warehouse_code)
				if (!warehouse) throw new Error(`Missing warehouse ${row.warehouse_code}`)
				return {
					updateOne: {
						filter: { warehouse, name: row.name },
						update: {
							$set: { warehouse, created_by: creatorId(row.creator), updated_at: now },
							$setOnInsert: { created_at: row.created_at, deleted: false }
						},
						upsert: true
					}
				}
			})
		)
		if (!result.isOk()) throw new Error('Failed storage location batch')
	}
	return { warehouses: warehouses.length, storageLocations: locations.length, fallbackUsers }
}
