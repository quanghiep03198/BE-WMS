import { resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { parseWarehouseSyncArgs, warehouseSyncUsage, type WarehouseSyncCliOptions } from './commands/run-args'
import { runWarehouseSync, type WarehouseSyncPool } from './commands/run-warehouse-sync'
import { loadMigrationEnv, type MigrationEnv } from './helpers/migration-env'
import { MongoManager } from './libs/mongoose'
import { MssqlManager } from './libs/mssql'

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
	options: WarehouseSyncCliOptions,
	config: MigrationEnv
) => WarehouseSyncManagers | Promise<WarehouseSyncManagers>

export async function askContinueAfterFailure(
	input: NodeJS.ReadableStream = process.stdin,
	output: NodeJS.WritableStream = process.stdout
): Promise<boolean> {
	const reader = createInterface({ input, output })
	const controller = new AbortController()
	reader.once('close', () => controller.abort())
	try {
		while (true) {
			let answer: string
			try {
				answer = await reader.question('Step failed. Continue to the next step? (y/n) ', {
					signal: controller.signal
				})
			} catch (error) {
				if (controller.signal.aborted) return false
				throw error
			}
			if (answer.trim().toLowerCase() === 'y') return true
			if (answer.trim().toLowerCase() === 'n') return false
		}
	} finally {
		reader.close()
	}
}

export async function runWarehouseSyncCli(
	argv: string[],
	createManagers: WarehouseSyncManagerFactory,
	loadConfig: () => MigrationEnv = loadMigrationEnv
): Promise<number> {
	let options: WarehouseSyncCliOptions
	let config: MigrationEnv
	try {
		config = argv.length === 1 && argv[0] === '--help' ? {} : loadConfig()
		options = parseWarehouseSyncArgs(argv, config)
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
		managers = await createManagers(options, config)
		mssqlConnectAttempted = true
		await managers.mssql.connect()
		mongoConnectAttempted = true
		await managers.mongo.connect()
		if (!managers.mssql.pool) throw new Error('MSSQL manager did not provide a connected pool')
		const shouldContinue = process.stdin.isTTY && process.stdout.isTTY ? () => askContinueAfterFailure() : undefined
		await runWarehouseSync(
			managers.mssql.pool as unknown as WarehouseSyncPool,
			managers.mongo.getDatabase(),
			options,
			undefined,
			shouldContinue
		)
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
	const createManagers: WarehouseSyncManagerFactory = (options, config) => ({
		mssql: new MssqlManager(options.dbHost, config),
		mongo: new MongoManager(options.mongoDbName, config)
	})
	void runWarehouseSyncCli(process.argv.slice(2), createManagers)
		.then((result) => {
			process.exitCode = result
		})
		.finally(() => {
			process.exit(process.exitCode)
		})
}
