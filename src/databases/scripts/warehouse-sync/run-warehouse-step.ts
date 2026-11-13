import { type mongo } from 'mongoose'
import { syncMongoWarehouses } from './mongo-warehouses'

interface WarehouseSqlRequest {
	input(name: string, value: string): unknown
	query(sql: string): Promise<{ recordset: Array<Record<string, unknown>> }>
}

function sourceText(value: unknown, field: string): string {
	if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid MSSQL ${field}`)
	return value
}

function sourceCreator(value: unknown): string | null {
	if (value === null) return null
	if (typeof value !== 'string') throw new Error('Invalid MSSQL creator')
	return value
}

function sourceDate(value: unknown): Date {
	if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error('Invalid MSSQL created date')
	return value
}

function sourceCapacity(value: unknown): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Invalid MSSQL warehouse capacity')
	return value
}

export async function runWarehouseStep(
	pool: { request(): WarehouseSqlRequest },
	database: mongo.Db,
	factoryCode: string,
	fallbackUsername: string
) {
	if (!factoryCode.trim()) throw new Error('Factory code is required')
	const warehouseRequest = pool.request()
	warehouseRequest.input('factory', factoryCode)
	const locationRequest = pool.request()
	locationRequest.input('factory', factoryCode)
	const [warehouseResult, locationResult] = await Promise.all([
		warehouseRequest.query(`
			SELECT warehouse_num AS code, warehouse_name AS name, capacity, created AS created_at,
				user_code_created AS creator
			FROM DV_DATA_LAKE.dbo.dv_warehouseccodemst
			WHERE cofactory_code = @factory AND isactive = 'Y'
		`),
		locationRequest.query(`
			SELECT w.warehouse_num AS warehouse_code, d.storage_num, d.storage_name AS name, d.created AS created_at,
				d.user_code_created AS creator
			FROM DV_DATA_LAKE.dbo.dv_warehouseccodedet AS d
			INNER JOIN DV_DATA_LAKE.dbo.dv_warehouseccodemst AS w
				ON d.warehouse_num = w.warehouse_num AND d.cofactory_code = w.cofactory_code
			WHERE d.cofactory_code = @factory AND d.isactive = 'Y' AND w.isactive = 'Y'
		`)
	])
	const warehouses = warehouseResult.recordset.map((row) => ({
		code: sourceText(row.code, 'warehouse code'),
		name: sourceText(row.name, 'warehouse name'),
		capacity: sourceCapacity(row.capacity),
		created_at: sourceDate(row.created_at),
		creator: sourceCreator(row.creator)
	}))
	const locations = locationResult.recordset.map((row) => ({
		warehouse_code: sourceText(row.warehouse_code, 'storage warehouse code'),
		storage_num: sourceText(row.storage_num, 'storage number'),
		name: sourceText(row.name, 'storage name'),
		created_at: sourceDate(row.created_at),
		creator: sourceCreator(row.creator)
	}))
	return syncMongoWarehouses(database, warehouses, locations, fallbackUsername)
}
