import type { mongo } from 'mongoose'
import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { createEpcBatchQueue } from '../helpers/epc-batch-queue'
import { streamMssqlRows, type MssqlStreamRequest } from '../helpers/mssql-stream'
import { referenceLookup } from '../helpers/reference-lookup'
import { isEligibleMoNo } from './mo-no'

const BATCH_SIZE = 1000

function requiredText(value: unknown, field: string): string {
	if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid finished goods EPC ${field}`)
	return value.trim()
}

function optionalText(value: unknown, field: string): string | null {
	if (value === null) return null
	return requiredText(value, field)
}

function requiredDate(value: unknown, field: string): Date {
	const date = value instanceof Date ? new Date(value) : typeof value === 'string' ? new Date(value) : null
	if (!date || !Number.isFinite(date.getTime())) throw new Error(`Invalid finished goods EPC ${field}`)
	return date
}

function optionalDate(value: unknown, field: string): Date | null {
	if (value === null) return null
	return requiredDate(value, field)
}

function sql(includeBackups: boolean, limited: boolean): string {
	const inboundBackup = includeBackups
		? /* SQL */ `
		UNION ALL
		SELECT a.EPC_Code, a.mo_no, a.po, a.rfid_status,
			a.storage AS storage_location, a.dept_code AS assembly_line, a.record_time
		FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily AS a
		INNER JOIN eligible_mos AS m ON m.mo_no = a.mo_no
		WHERE a.station_suffix = '101' AND a.EPC_Code NOT LIKE 'E28%'
			AND LEFT(a.mo_no, 2) >= '14'`
		: ''
	const outboundBackup = includeBackups
		? /* SQL */ `
		UNION
		SELECT a.EPC_Code, a.size_code, a.mo_no, a.po, a.record_time, a.rfid_status, a.rfid_use
		FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily AS a
		INNER JOIN eligible_mos AS m ON m.mo_no = a.mo_no
		WHERE a.station_suffix = '103' AND a.EPC_Code NOT LIKE 'E28%'
			AND LEFT(a.mo_no, 2) >= '14'`
		: ''

	return /* SQL */ `
		WITH eligible_mos AS (
			SELECT [value] AS mo_no
			FROM OPENJSON(@moNos)
		),
		epcs_at_101_history AS (
			SELECT a.EPC_Code, a.mo_no, a.po, a.rfid_status,
				a.storage AS storage_location, a.dept_code AS assembly_line, a.record_time
			FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet AS a
			INNER JOIN eligible_mos AS m ON m.mo_no = a.mo_no
			WHERE a.station_suffix = '101' AND a.EPC_Code NOT LIKE 'E28%'
			${inboundBackup}
		),
		epcs_at_101_ranked AS (
			SELECT EPC_Code, mo_no, po, rfid_status, storage_location, assembly_line, record_time,
				ROW_NUMBER() OVER (PARTITION BY EPC_Code ORDER BY record_time DESC) AS rn
			FROM epcs_at_101_history
		),
		epcs_at_101 AS (
			SELECT EPC_Code, mo_no, po, rfid_status, storage_location, assembly_line, record_time
			FROM epcs_at_101_ranked
			WHERE rn = 1
		),
		epcs_at_103_history AS (
			SELECT a.EPC_Code, a.size_code, a.mo_no, a.po, a.record_time, a.rfid_status, a.rfid_use
			FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet AS a
			INNER JOIN eligible_mos AS m ON m.mo_no = a.mo_no
			WHERE a.station_suffix = '103' AND a.EPC_Code NOT LIKE 'E28%'
			${outboundBackup}
		),
		epcs_at_103_ranked AS (
			SELECT EPC_Code, size_code, mo_no, po, record_time, rfid_status, rfid_use,
				ROW_NUMBER() OVER (PARTITION BY EPC_Code ORDER BY record_time DESC) AS rn
			FROM epcs_at_103_history
		),
		epcs_at_103 AS (
			SELECT EPC_Code, size_code, mo_no, po, record_time, rfid_status, rfid_use
			FROM epcs_at_103_ranked
			WHERE rn = 1
		)
		SELECT ${limited ? 'TOP (CAST(@maxRows AS int)) ' : ''}_101.EPC_Code AS epc, _101.mo_no, _103.po,
			@inboundDeviceSn AS inbound_device_sn,
			IIF(_103.EPC_Code IS NOT NULL, @outboundDeviceSn, NULL) AS outbound_device_sn,
			IIF(_103.record_time > _101.record_time, _103.record_time, _101.record_time) AS last_scanned_at,
			_101.record_time AS inbound_at, _103.record_time AS outbound_at,
			_101.storage_location, _101.assembly_line,
			1 AS inbound_times,
			CASE WHEN _103.EPC_Code IS NOT NULL THEN 'shipped'
				WHEN _101.rfid_status = 'B' THEN 'recalled'
				ELSE 'instock' END AS status
		FROM epcs_at_101 AS _101
		LEFT OUTER JOIN epcs_at_103 AS _103 ON _101.EPC_Code = _103.EPC_Code
		${limited ? 'ORDER BY _101.EPC_Code' : ''}
	`
}

type FinishedGoodsEpc = {
	epc: string
	mo_no: string
	po: string | null
	inbound_device_sn: string
	outbound_device_sn: string | null
	last_scanned_at: Date
	inbound_at: Date
	outbound_at: Date | null
	storage_location: string | null
	assembly_line: string | null
	inbound_times: 1
	status: 'shipped' | 'recalled' | 'instock'
}

function referenceCode(value: unknown, field: string): string | null {
	if (value === null) return null
	if (typeof value !== 'string') throw new Error(`Invalid finished goods EPC ${field}`)
	return value.trim() || null
}

function mapFinishedGoodsEpc(row: unknown): FinishedGoodsEpc {
	if (!row || typeof row !== 'object') throw new Error('Invalid finished goods EPC row')
	const fields = [
		'epc',
		'mo_no',
		'po',
		'inbound_device_sn',
		'outbound_device_sn',
		'last_scanned_at',
		'inbound_at',
		'outbound_at',
		'storage_location',
		'assembly_line',
		'status'
	]
	if (!fields.every((field) => field in row)) throw new Error('Incomplete finished goods EPC row')

	const source = row as Record<string, unknown>
	const status = requiredText(source.status, 'status')
	if (status !== 'shipped' && status !== 'recalled' && status !== 'instock') {
		throw new Error('Invalid finished goods EPC status')
	}
	return {
		epc: requiredText(source.epc, 'epc'),
		mo_no: requiredText(source.mo_no, 'mo_no'),
		po: optionalText(source.po, 'po'),
		inbound_device_sn: requiredText(source.inbound_device_sn, 'inbound_device_sn'),
		outbound_device_sn: optionalText(source.outbound_device_sn, 'outbound_device_sn'),
		last_scanned_at: requiredDate(source.last_scanned_at, 'last_scanned_at'),
		inbound_at: requiredDate(source.inbound_at, 'inbound_at'),
		outbound_at: optionalDate(source.outbound_at, 'outbound_at'),
		storage_location: referenceCode(source.storage_location, 'storage_location')?.toUpperCase() ?? null,
		assembly_line: referenceCode(source.assembly_line, 'assembly_line'),
		inbound_times: 1,
		status
	}
}

async function loadReferences(database: mongo.Db) {
	const [locations, departments] = await Promise.all([
		database
			.collection<{ storage_num?: unknown }>('storage_locations')
			.find({}, { projection: { _id: 1, storage_num: 1 } })
			.toArray(),
		database
			.collection<{ code?: unknown }>('departments')
			.find({}, { projection: { _id: 1, code: 1 } })
			.toArray()
	])
	return {
		locations: referenceLookup(
			locations.map((row) => ({ _id: row._id, key: row.storage_num })),
			'storage_locations',
			(key) => key.toUpperCase()
		),
		departments: referenceLookup(
			departments.map((row) => ({ _id: row._id, key: row.code })),
			'departments',
			(key) => key
		)
	}
}

function enrichmentPipeline(epcs: string[], references: Awaited<ReturnType<typeof loadReferences>>): mongo.Document[] {
	return [
		{ $match: { _id: { $in: epcs } } },
		{
			$lookup: {
				from: 'finished_goods_epcs_match',
				let: { epc: '$epc' },
				pipeline: [{ $match: { $expr: { $eq: ['$epc', '$$epc'] } } }, { $sort: { _id: 1 } }, { $limit: 1 }],
				as: '_match'
			}
		},
		{
			$lookup: {
				from: 'departments',
				let: { code: '$assembly_line' },
				pipeline: [
					{
						$match: {
							$expr: {
								$and: [
									{ $ne: ['$$code', null] },
									{ $eq: [{ $trim: { input: { $ifNull: ['$code', ''] } } }, '$$code'] }
								]
							}
						}
					},
					{ $sort: { _id: 1 } },
					{ $limit: 1 }
				],
				as: '_department'
			}
		},
		{
			$lookup: {
				from: 'storage_locations',
				let: { code: '$storage_location' },
				pipeline: [
					{
						$match: {
							$expr: {
								$and: [
									{ $ne: ['$$code', null] },
									{ $eq: [{ $toUpper: { $trim: { input: { $ifNull: ['$storage_num', ''] } } } }, '$$code'] }
								]
							}
						}
					},
					{ $sort: { _id: 1 } },
					{ $limit: 1 }
				],
				as: '_location'
			}
		},
		{
			$set: {
				_match: { $arrayElemAt: ['$_match', 0] },
				_department: { $arrayElemAt: ['$_department._id', 0] },
				_location: { $arrayElemAt: ['$_location._id', 0] }
			}
		},
		{
			$set: {
				factory_shoes_style: '$_match.factory_shoes_style',
				color_sn: '$_match.color_sn',
				size_numcode: '$_match.size_numcode',
				assembly_line: { $ifNull: ['$_department', references.departments.fallback] },
				storage_location: { $ifNull: ['$_location', references.locations.fallback] }
			}
		}
	]
}

interface FinishedGoodsEpcOptions {
	inboundDeviceSn: string
	outboundDeviceSn: string
	includeBackups?: boolean
	concurrency?: number
	batchSize?: number
	chunkSize?: number
	maxRows?: number
	writeMode?: 'upsert' | 'insert'
}

export async function runFinishedGoodsEpcStep(
	pool: { request(): MssqlStreamRequest },
	database: mongo.Db,
	options: FinishedGoodsEpcOptions
): Promise<{ epcs: number }> {
	const runId = randomUUID()
	const locks = database.collection<{ _id: string; owner: string; started_at: Date }>('warehouse_sync_locks')
	try {
		await locks.insertOne({ _id: 'finished_goods_epcs', owner: runId, started_at: new Date() })
	} catch (error) {
		if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
			throw new Error('Finished goods EPC sync is already running or has a stale lock', { cause: error })
		}
		throw error
	}
	let failed = false
	let originalError: unknown
	try {
		return await runFinishedGoodsEpcStepWithLock(pool, database, options, runId)
	} catch (error) {
		failed = true
		originalError = error
		throw error
	} finally {
		try {
			const released = await locks.deleteOne({ _id: 'finished_goods_epcs', owner: runId })
			if (released.deletedCount !== 1) throw new Error('Finished goods EPC sync lock was not released')
		} catch (error) {
			if (failed) throw new AggregateError([originalError, error], 'Finished goods EPC sync and lock release failed')
			throw error
		}
	}
}

async function runFinishedGoodsEpcStepWithLock(
	pool: { request(): MssqlStreamRequest },
	database: mongo.Db,
	options: FinishedGoodsEpcOptions,
	runId: string
): Promise<{ epcs: number }> {
	const startedAt = performance.now()
	const concurrency = options.concurrency ?? 4
	const batchSize = options.batchSize ?? BATCH_SIZE
	const chunkSize = options.chunkSize ?? batchSize
	if (!Number.isSafeInteger(concurrency) || concurrency < 1) throw new Error('Invalid finished goods EPC concurrency')
	if (!Number.isSafeInteger(batchSize) || batchSize < 1) throw new Error('Invalid finished goods EPC batch size')
	if (!Number.isSafeInteger(chunkSize) || chunkSize < batchSize)
		throw new Error('Invalid finished goods EPC chunk size')
	if (options.maxRows !== undefined && (!Number.isSafeInteger(options.maxRows) || options.maxRows < 1)) {
		throw new Error('Invalid finished goods EPC row limit')
	}
	if (options.writeMode !== undefined && options.writeMode !== 'upsert' && options.writeMode !== 'insert') {
		throw new Error('Invalid finished goods EPC write mode')
	}
	if (
		options.writeMode === 'insert' &&
		(await database.collection('finished_goods_epcs').findOne({}, { projection: { _id: 1 } }))
	)
		throw new Error('Finished goods EPC insert mode requires an empty target')
	const inboundDeviceSn = requiredText(options.inboundDeviceSn, 'inbound device SN')
	const outboundDeviceSn = requiredText(options.outboundDeviceSn, 'outbound device SN')
	if (options.includeBackups !== undefined && typeof options.includeBackups !== 'boolean') {
		throw new Error('Invalid finished goods EPC includeBackups option')
	}
	const includeBackups = options.includeBackups ?? false
	const manufacturingOrders = await database
		.collection<{ mo_no?: unknown }>('manufacturing_orders')
		.find({}, { projection: { _id: 0, mo_no: 1 } })
		.toArray()
	const moNos = [
		...new Set(
			manufacturingOrders.flatMap(({ mo_no }) => (typeof mo_no === 'string' && isEligibleMoNo(mo_no) ? [mo_no] : []))
		)
	]
	const staging = database.collection<{ _id: string; epc: string; __epc_sync_run?: string }>(
		'finished_goods_epcs_staging'
	)
	const seen = new Set<string>()
	let operations: mongo.AnyBulkWriteOperation<{ _id: string; epc: string }>[] = []
	let epcs = 0
	let batches = 0
	let mongoBulkWriteMs = 0
	let referencesPromise: ReturnType<typeof loadReferences> | undefined
	let fallbackLocations = 0
	let fallbackDepartments = 0
	let missingMatches = 0
	let targetIndexPromise: Promise<void> | undefined

	async function dropStaging(): Promise<void> {
		const exists = await database
			.listCollections({ name: 'finished_goods_epcs_staging' }, { nameOnly: true })
			.hasNext()
		if (exists) await staging.drop()
	}

	function logMetrics(): void {
		const elapsedMs = Math.max(0, performance.now() - startedAt)
		console.info('Finished goods EPC sync metrics', {
			elapsedMs,
			epcs,
			batches,
			epcsPerSecond: elapsedMs > 0 ? (epcs * 1000) / elapsedMs : 0,
			mongoBulkWriteMs
		})
	}

	if (!moNos.length) {
		await dropStaging()
		logMetrics()
		return { epcs: 0 }
	}

	async function flush(batch: mongo.AnyBulkWriteOperation<{ _id: string; epc: string }>[]): Promise<number> {
		const bulkWriteStartedAt = performance.now()
		const result = await staging.bulkWrite(batch, { ordered: false })
		mongoBulkWriteMs += Math.max(0, performance.now() - bulkWriteStartedAt)
		if (!result.isOk()) throw new Error('Failed finished goods EPC staging bulk write')
		referencesPromise ??= loadReferences(database)
		const references = await referencesPromise
		const batchEpcs = batch.map((operation) => {
			if (!('updateOne' in operation) || typeof operation.updateOne.filter._id !== 'string') {
				throw new Error('Invalid finished goods EPC staging operation')
			}
			return operation.updateOne.filter._id
		})
		const pipeline = enrichmentPipeline(batchEpcs, references)
		const resolved = await staging.aggregate(pipeline).toArray()
		if (resolved.length !== batch.length) throw new Error('Incomplete finished goods EPC staging batch')
		let matched = 0
		for (const row of resolved) {
			if (!row._match) {
				missingMatches++
				continue
			}
			requiredText(row.factory_shoes_style, 'factory_shoes_style')
			requiredText(row.color_sn, 'color_sn')
			requiredText(row.size_numcode, 'size_numcode')
			if (!row._location) fallbackLocations++
			if (!row._department) fallbackDepartments++
			matched++
		}
		if (matched) {
			targetIndexPromise ??= (async () => {
				const collection = database.collection('finished_goods_epcs')
				const exists = await database.listCollections({ name: 'finished_goods_epcs' }).hasNext()
				const indexes = exists ? await collection.indexes() : []
				const hasUniqueEpc = indexes.some(
					(index) =>
						index.unique &&
						!index.partialFilterExpression &&
						Object.keys(index.key).length === 1 &&
						index.key.epc === 1
				)
				if (!hasUniqueEpc) await collection.createIndex({ epc: 1 }, { name: 'idx_epc', unique: true })
			})()
			await targetIndexPromise
			if (options.writeMode === 'insert') {
				const inserts = resolved
					.filter((row) => row._match)
					.map((row) => {
						const { _id, _match, _department, _location, __epc_sync_run, ...document } = row
						return {
							insertOne: {
								document: {
									...document,
									factory_shoes_style: requiredText(document.factory_shoes_style, 'factory_shoes_style'),
									color_sn: requiredText(document.color_sn, 'color_sn'),
									size_numcode: requiredText(document.size_numcode, 'size_numcode'),
									created_at: document.updated_at,
									scannable: true,
									deleted: false
								}
							}
						}
					})
				const result = await database.collection('finished_goods_epcs').bulkWrite(inserts, { ordered: false })
				if (!result.isOk()) throw new Error('Failed finished goods EPC insert batch')
			} else {
				const fields = [
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
					'inbound_times',
					'status',
					'updated_at'
				]
				await staging
					.aggregate([
						...pipeline,
						{ $match: { _match: { $exists: true, $ne: null } } },
						{
							$set: {
								factory_shoes_style: { $trim: { input: '$factory_shoes_style' } },
								color_sn: { $trim: { input: '$color_sn' } },
								size_numcode: { $trim: { input: '$size_numcode' } }
							}
						},
						{ $set: { created_at: '$updated_at', scannable: true, deleted: false } },
						{ $unset: ['_id', '_match', '_department', '_location', '__epc_sync_run'] },
						{
							$merge: {
								into: 'finished_goods_epcs',
								on: 'epc',
								whenMatched: [{ $set: Object.fromEntries(fields.map((field) => [field, `$$new.${field}`])) }],
								whenNotMatched: 'insert'
							}
						}
					])
					.toArray()
			}
		}
		epcs += matched
		batches++
		return matched
	}

	let chunk = 0
	const queue = createEpcBatchQueue(concurrency, async (batch: typeof operations) => {
		const chunkNumber = ++chunk
		const started = performance.now()
		try {
			let written = 0
			for (let offset = 0; offset < batch.length; offset += batchSize) {
				written += await flush(batch.slice(offset, offset + batchSize))
			}
			console.info('Finished goods EPC chunk', {
				chunk: chunkNumber,
				rows: batch.length,
				written,
				elapsedMs: performance.now() - started,
				errors: 0
			})
		} catch (error) {
			const errors =
				error && typeof error === 'object' && 'writeErrors' in error && Array.isArray(error.writeErrors)
					? error.writeErrors.length
					: null
			console.error('Finished goods EPC chunk failed', {
				chunk: chunkNumber,
				rows: batch.length,
				elapsedMs: performance.now() - started,
				errors,
				error
			})
			throw error
		}
	})
	let rowsRead = 0
	try {
		for await (const row of streamMssqlRows(pool.request(), sql(includeBackups, options.maxRows !== undefined), {
			inboundDeviceSn,
			outboundDeviceSn,
			moNos: JSON.stringify(moNos),
			...(options.maxRows !== undefined ? { maxRows: String(options.maxRows) } : {})
		})) {
			const epc = mapFinishedGoodsEpc(row)
			if (seen.has(epc.epc)) throw new Error(`Duplicate finished goods EPC ${epc.epc}`)
			seen.add(epc.epc)
			const now = new Date()
			operations.push({
				updateOne: {
					filter: { _id: epc.epc, __epc_sync_run: { $ne: runId } },
					update: {
						$set: {
							...epc,
							__epc_sync_run: runId,
							updated_at: now
						}
					},
					upsert: true
				}
			})
			rowsRead++
			if (operations.length >= chunkSize) {
				await queue.submit(operations)
				operations = []
				seen.clear()
			}
			if (options.maxRows !== undefined && rowsRead >= options.maxRows) break
		}
		if (operations.length) await queue.submit(operations)
		await queue.close()
	} catch (error) {
		try {
			await queue.close()
		} catch (writeError) {
			if (writeError !== error)
				throw new AggregateError([error, writeError], 'Finished goods EPC stream and write failed')
		}
		throw error
	} finally {
		if (missingMatches) console.warn(`Finished goods EPC missing match: ${missingMatches}; not merged`)
		if (fallbackLocations || fallbackDepartments) {
			console.warn(
				`Finished goods EPC fallback references: storage_location ${fallbackLocations}, assembly_line ${fallbackDepartments}`
			)
		}
	}
	await dropStaging()
	logMetrics()
	return { epcs }
}
