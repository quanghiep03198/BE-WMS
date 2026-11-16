import type { mongo } from 'mongoose'
import { createHash, randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { assertLocalMongoUri, runEpcBenchmark } from './commands/benchmark-epc-sync'
import { parseEpcSyncArgs } from './commands/epc-sync-args'
import { isEligibleMoNo } from './commands/mo-no'
import { localEpcMongoUri, openEpcSyncConnections } from './epc-sync'
import { loadMigrationEnv } from './helpers/migration-env'

async function copyDocuments(
	source: mongo.Db,
	target: mongo.Db,
	name: string,
	filter: mongo.Document,
	projection: mongo.Document,
	limit: number
): Promise<number> {
	const cursor = source
		.collection(name)
		.find(filter, { projection })
		.limit(limit + 1)
	let batch: mongo.Document[] = []
	let count = 0
	try {
		for await (const document of cursor) {
			count++
			if (count > limit) throw new Error(`Benchmark reference collection ${name} exceeds ${limit} rows`)
			batch.push(document)
			if (batch.length === 1000) {
				await target.collection(name).insertMany(batch, { ordered: false })
				batch = []
			}
		}
		if (batch.length) await target.collection(name).insertMany(batch, { ordered: false })
	} finally {
		await cursor.close()
	}
	return count
}

async function main(argv: string[]): Promise<void> {
	const index = argv.indexOf('--source-mongo-db')
	if (index < 0 || !argv[index + 1] || argv[index + 1].startsWith('--')) {
		throw new Error('Provide --source-mongo-db for benchmark reference data')
	}
	const sourceName = argv[index + 1]
	const remaining = [...argv.slice(0, index), ...argv.slice(index + 2)]
	if (remaining.includes('--source-mongo-db')) throw new Error('Duplicate --source-mongo-db')
	const config = loadMigrationEnv()
	const options = parseEpcSyncArgs(remaining, config)
	if (options.stage === 'both') throw new Error('Benchmark requires --stage match or epc')
	assertLocalMongoUri(localEpcMongoUri(config))
	const inboundDeviceSn = options.inboundDeviceSn ?? config.DEVICE_SN_101?.trim()
	const outboundDeviceSn = options.outboundDeviceSn ?? config.DEVICE_SN_103?.trim()
	if (options.stage === 'epc' && (!inboundDeviceSn || !outboundDeviceSn)) {
		throw new Error('DEVICE_SN_101 and DEVICE_SN_103 are required for EPC benchmark')
	}
	if (sourceName === options.mongoDatabase) throw new Error('Benchmark source and destination databases must differ')
	const maxRows = options.chunkSize * 8
	if (!Number.isSafeInteger(maxRows) || maxRows > 100000) throw new Error('Benchmark row limit must not exceed 100000')
	const connections = await openEpcSyncConnections(options, config)
	try {
		const client = connections.database.client
		const source = client.db(sourceName)
		const candidateOrders = await source
			.collection<{ mo_no?: unknown }>('manufacturing_orders')
			.find({}, { projection: { _id: 0, mo_no: 1 } })
			.limit(200)
			.toArray()
		const candidates = candidateOrders
			.flatMap(({ mo_no }) => (typeof mo_no === 'string' && isEligibleMoNo(mo_no) ? [mo_no] : []))
			.slice(0, 30)
		const orders: Array<{ mo_no: string; count: number }> = []
		for (const mo_no of candidates) {
			const count = await source
				.collection('finished_goods_epcs_match')
				.countDocuments({ mo_no }, { limit: maxRows })
			if (count) orders.push({ mo_no, count })
		}
		orders.sort((a, b) => b.count - a.count || a.mo_no.localeCompare(b.mo_no))
		const moNos = orders.slice(0, 8).map(({ mo_no }) => mo_no)
		if (!moNos.length) throw new Error('No eligible benchmark manufacturing orders with EPC matches')
		console.info('EPC benchmark sample', {
			stage: options.stage,
			orders: moNos.length,
			maxRows,
			batchSize: options.batchSize,
			chunkSize: options.chunkSize,
			mode: options.writeMode
		})
		const report = await runEpcBenchmark(maxRows, async (concurrency) => {
			const name = `epc_sync_bench_${randomUUID().replaceAll('-', '')}`
			const target = client.db(name)
			let originalError: unknown
			try {
				await target.collection('manufacturing_orders').insertMany(moNos.map((mo_no) => ({ mo_no })))
				if (options.stage === 'epc') {
					await copyDocuments(source, target, 'storage_locations', {}, { _id: 1, storage_num: 1 }, 10000)
					await copyDocuments(source, target, 'departments', {}, { _id: 1, code: 1 }, 10000)
					await copyDocuments(
						source,
						target,
						'finished_goods_epcs_match',
						{ mo_no: { $in: moNos } },
						{ _id: 1, epc: 1, mo_no: 1, factory_shoes_style: 1, color_sn: 1, size_numcode: 1 },
						100000
					)
					await target.collection('finished_goods_epcs_match').createIndex({ epc: 1 }, { unique: true })
				}
				let peakRssBytes = process.memoryUsage().rss
				const sampler = setInterval(() => {
					peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss)
				}, 100)
				const started = performance.now()
				let rows: number
				let elapsedMs: number
				try {
					const settings = {
						concurrency,
						batchSize: options.batchSize,
						chunkSize: options.chunkSize,
						maxRows,
						writeMode: options.writeMode
					}
					if (options.stage === 'match') {
						rows = (await connections.match(connections.pool, target, settings)).epcMatches
					} else {
						if (!inboundDeviceSn || !outboundDeviceSn) throw new Error('Missing EPC device serials')
						rows = (
							await connections.epc(connections.pool, target, {
								...settings,
								includeBackups: options.includeBackups,
								inboundDeviceSn,
								outboundDeviceSn
							})
						).epcs
					}
					elapsedMs = performance.now() - started
					peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss)
				} finally {
					clearInterval(sampler)
				}
				const name = options.stage === 'match' ? 'finished_goods_epcs_match' : 'finished_goods_epcs'
				const fields =
					options.stage === 'match'
						? [
								'epc',
								'mo_no',
								'factory_shoes_style',
								'cust_shoes_style',
								'factory_code_produce',
								'size_numcode',
								'color_sn'
							]
						: [
								'epc',
								'mo_no',
								'po',
								'factory_shoes_style',
								'color_sn',
								'size_numcode',
								'inbound_device_sn',
								'outbound_device_sn',
								'last_scanned_at',
								'inbound_at',
								'outbound_at',
								'storage_location',
								'assembly_line',
								'status'
							]
				const projection = Object.fromEntries([...fields.map((field) => [field, 1]), ['_id', 0]])
				const hash = createHash('sha256')
				for await (const document of target.collection(name).find({}, { projection }).sort({ epc: 1 })) {
					hash.update(JSON.stringify(fields.map((field) => document[field])) + '\n')
				}
				const result = { concurrency, rows, elapsedMs, fingerprint: hash.digest('hex'), peakRssBytes }
				console.info('EPC benchmark result', { ...result, rowsPerSecond: (rows * 1000) / elapsedMs })
				return result
			} catch (error) {
				originalError = error
				throw error
			} finally {
				try {
					await target.dropDatabase()
				} catch (cleanupError) {
					if (originalError)
						throw new AggregateError([originalError, cleanupError], 'Benchmark and cleanup failed')
					throw cleanupError
				}
			}
		})
		console.info('EPC benchmark summary', report)
		if (report.estimatedSecondsAtBest === null) {
			throw new Error('Benchmark sample was incomplete or changed between runs; no full-run estimate is valid')
		}
	} finally {
		await connections.close()
	}
}

main(process.argv.slice(2)).catch((error: unknown) => {
	console.error('EPC benchmark failed:', error instanceof Error ? error.message : String(error))
	process.exitCode = 1
})
