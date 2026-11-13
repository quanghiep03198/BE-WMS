import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MongoManager } from '../libs/mongoose'
import { MssqlManager } from '../libs/mssql'
import { parseWarehouseSyncArgs, warehouseSyncUsage, type WarehouseSyncCliOptions } from './run-args'
import { runWarehouseSync, type WarehouseSyncPool } from './run-warehouse-sync'

export interface WarehouseSyncManagers {
	mssql: {
		connect(): Promise<void>
		disconnect(): Promise<void>
		pool?: MssqlManager['pool']
	}
	mongo: {
		connect(): Promise<void>
		disconnect(): Promise<void>
		getDatabase(): ReturnType<MongoManager['getDatabase']>
	}
}

export type WarehouseSyncManagerFactory = (
	options: WarehouseSyncCliOptions
) => WarehouseSyncManagers | Promise<WarehouseSyncManagers>

export async function runWarehouseSyncCli(
	argv: string[],
	createManagers: WarehouseSyncManagerFactory
): Promise<number> {
	let options: WarehouseSyncCliOptions
	try {
		options = parseWarehouseSyncArgs(argv)
	} catch (error) {
		console.error(`Warehouse sync argument error: ${error instanceof Error ? error.message : String(error)}`)
		return 1
	}

	if (options.help) {
		console.log(warehouseSyncUsage)
		return 0
	}

	let managers: WarehouseSyncManagers | undefined
	let mssqlConnectAttempted = false
	let mongoConnectAttempted = false
	let result = 0
	try {
		managers = await createManagers(options)
		mssqlConnectAttempted = true
		await managers.mssql.connect()
		mongoConnectAttempted = true
		await managers.mongo.connect()
		if (!managers.mssql.pool) throw new Error('MSSQL manager did not provide a connected pool')
		await runWarehouseSync(managers.mssql.pool as unknown as WarehouseSyncPool, managers.mongo.getDatabase(), options)
	} catch (error) {
		console.error(`Warehouse sync failed: ${error instanceof Error ? error.message : String(error)}`)
		result = 1
	} finally {
		if (managers) {
			for (const [attempted, disconnect] of [
				[mongoConnectAttempted, () => managers?.mongo.disconnect()],
				[mssqlConnectAttempted, () => managers?.mssql.disconnect()]
			] as const) {
				if (!attempted) continue
				try {
					await disconnect()
				} catch (error) {
					console.error(
						`Warehouse sync disconnect failed: ${error instanceof Error ? error.message : String(error)}`
					)
					result = 1
				}
			}
		}
	}
	return result
}

const isEntrypoint = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isEntrypoint) {
	const createManagers: WarehouseSyncManagerFactory = (options) => ({
		mssql: new MssqlManager(options.dbHost),
		mongo: new MongoManager(options.mongoDbName)
	})
	void runWarehouseSyncCli(process.argv.slice(2), createManagers).then((result) => {
		process.exitCode = result
	})
}
