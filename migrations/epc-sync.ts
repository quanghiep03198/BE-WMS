import mongoose from 'mongoose'
import mssql from 'mssql'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEpcSyncArgs, type EpcSyncOptions } from './commands/epc-sync-args'
import { runFinishedGoodsEpcStep } from './commands/finished-goods-epcs'
import { runEpcMatchStep } from './commands/run-epc-match-step'
import { loadMigrationEnv, type MigrationEnv } from './helpers/migration-env'
import { migrationMssqlConfig } from './helpers/migration-mssql-config'

const usage = `Usage: bun --no-env-file run migrations/epc-sync.ts [options]

Options: --concurrency <n> --batch-size <1000-5000> --chunk-size <rows>
         --db-host <host> --mongo-db <database>
         --stage <both|match|epc>
         --write-mode <upsert|insert> --device-sn-101 <serial> --device-sn-103 <serial>
         --include-backups --help
Database settings come from migrations/.env. DEVICE_SN_101 and
DEVICE_SN_103 supply device serials unless the CLI overrides are provided.`

interface Connections {
	pool: Parameters<typeof runEpcMatchStep>[0]
	database: Parameters<typeof runEpcMatchStep>[1]
	close(): Promise<void>
	match: typeof runEpcMatchStep
	epc: typeof runFinishedGoodsEpcStep
}

export function localEpcMongoUri(config: MigrationEnv): string {
	const value = config.MONGO_URI?.trim()
	if (!value) throw new Error('MONGO_URI is required')
	let uri: URL
	try {
		uri = new URL(value)
		uri.pathname = ``
	} catch {
		throw new Error('MONGO_URI must be a single local MongoDB URI')
	}
	if (
		uri.protocol !== 'mongodb:' ||
		!['localhost', '127.0.0.1'].includes(uri.hostname.toLowerCase()) ||
		(uri.searchParams.has('directConnection') && uri.searchParams.get('directConnection') !== 'true')
	) {
		throw new Error('MONGO_URI must be a single local MongoDB URI')
	}
	uri.searchParams.set('directConnection', 'true')
	return uri.toString()
}

export async function openEpcSyncConnections(options: EpcSyncOptions, config: MigrationEnv): Promise<Connections> {
	const sqlConfig = migrationMssqlConfig(options.dbHost, config)
	const mongoUri = localEpcMongoUri(config)
	const pool = new mssql.ConnectionPool(sqlConfig)
	const client = new mongoose.mongo.MongoClient(mongoUri)
	await pool.connect()
	try {
		await client.connect()
	} catch (error) {
		await pool.close()
		throw error
	}
	return {
		pool,
		database: client.db(options.mongoDatabase),
		match: runEpcMatchStep,
		epc: runFinishedGoodsEpcStep,
		async close() {
			const results = await Promise.allSettled([client.close(), pool.close()])
			const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
			if (failures.length)
				throw new AggregateError(
					failures.map((failure) => failure.reason),
					'Disconnect failed'
				)
		}
	}
}

export async function runEpcSyncCli(
	argv: string[],
	createConnections: (options: EpcSyncOptions, config: MigrationEnv) => Promise<Connections> = openEpcSyncConnections,
	loadConfig: () => MigrationEnv = loadMigrationEnv
): Promise<number> {
	if (argv.length === 1 && argv[0] === '--help') {
		console.log(usage)
		return 0
	}
	let connections: Connections | undefined
	let failed = false
	try {
		const config = loadConfig()
		const options = parseEpcSyncArgs(argv, config)
		const inboundDeviceSn = options.inboundDeviceSn ?? config.DEVICE_SN_101?.trim()
		const outboundDeviceSn = options.outboundDeviceSn ?? config.DEVICE_SN_103?.trim()
		if (options.stage !== 'match' && (!inboundDeviceSn || !outboundDeviceSn)) {
			throw new Error('DEVICE_SN_101 and DEVICE_SN_103 are required for EPC sync')
		}
		connections = await createConnections(options, config)
		const settings = {
			concurrency: options.concurrency,
			batchSize: options.batchSize,
			chunkSize: options.chunkSize,
			writeMode: options.writeMode
		}
		if (options.stage !== 'epc') {
			await connections.match(connections.pool, connections.database, settings)
		}
		if (options.stage !== 'match') {
			if (!inboundDeviceSn || !outboundDeviceSn) throw new Error('EPC device serials are required')
			await connections.epc(connections.pool, connections.database, {
				...settings,
				includeBackups: options.includeBackups,
				inboundDeviceSn,
				outboundDeviceSn
			})
		}
	} catch (error) {
		failed = true
		const message = error instanceof Error ? error.message : String(error)
		console.error('EPC sync failed:', message.replace(/(mongodb(?:\+srv)?:\/\/)[^@\s]+@/gi, '$1[redacted]@'))
	} finally {
		if (connections) {
			try {
				await connections.close()
			} catch (error) {
				failed = true
				console.error('EPC sync disconnect failed:', error instanceof Error ? error.message : String(error))
			}
		}
	}
	return failed ? 1 : 0
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	void runEpcSyncCli(process.argv.slice(2)).then((result) => {
		process.exitCode = result
	})
}
