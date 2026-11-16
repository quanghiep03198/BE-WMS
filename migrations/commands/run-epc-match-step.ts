import type { mongo } from 'mongoose'
import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { createEpcBatchQueue } from '../helpers/epc-batch-queue'
import { streamMssqlRows, type MssqlStreamRequest } from '../helpers/mssql-stream'

function requiredText(value: unknown, name: string): string {
	if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid EPC match ${name}`)
	return value.trim()
}

export async function runEpcMatchStep(
	pool: { request(): MssqlStreamRequest },
	database: mongo.Db,
	options: {
		concurrency?: number
		batchSize?: number
		chunkSize?: number
		maxRows?: number
		writeMode?: 'upsert' | 'insert'
	} = {}
): Promise<{ epcMatches: number }> {
	const concurrency = options.concurrency ?? 4
	const batchSize = options.batchSize ?? 1000
	const chunkSize = options.chunkSize ?? batchSize
	if (!Number.isSafeInteger(concurrency) || concurrency < 1) throw new Error('Invalid EPC match concurrency')
	if (!Number.isSafeInteger(batchSize) || batchSize < 1) throw new Error('Invalid EPC match batch size')
	if (!Number.isSafeInteger(chunkSize) || chunkSize < batchSize) throw new Error('Invalid EPC match chunk size')
	if (options.maxRows !== undefined && (!Number.isSafeInteger(options.maxRows) || options.maxRows < 1)) {
		throw new Error('Invalid EPC match row limit')
	}
	if (options.writeMode !== undefined && options.writeMode !== 'upsert' && options.writeMode !== 'insert') {
		throw new Error('Invalid EPC match write mode')
	}
	const matches = database.collection('finished_goods_epcs_match')
	if (options.writeMode === 'insert' && (await matches.findOne({}, { projection: { _id: 1 } }))) {
		throw new Error('EPC match insert mode requires an empty target')
	}
	const tracker = database.collection<{ _id: string }>(
		`finished_goods_epcs_match_seen_${randomUUID().replaceAll('-', '')}`
	)
	let trackerCreated = false
	await matches.createIndex({ epc: 1 }, { name: 'idx_epc', unique: true })
	const cursor = database.collection<{ mo_no: string }>('manufacturing_orders').find({}, { projection: { mo_no: 1 } })
	let epcMatches = 0
	let moCount = 0
	let chunk = 0
	let orderBatch: string[] = []

	async function processBatch(orders: string[]) {
		const parameters: Record<string, string> = {}
		for (const [index, order] of orders.entries()) parameters[`mo${index}`] = order
		const placeholders = Object.keys(parameters)
			.map((key) => `@${key}`)
			.join(', ')
		if (options.maxRows !== undefined) parameters.maxRows = String(options.maxRows - epcMatches)
		const sql = /* SQL */ `
			SELECT ${options.maxRows !== undefined ? 'TOP (CAST(@maxRows AS int)) ' : ''}EPC_Code AS epc, ISNULL(mo_no_actual, mo_no) AS mo_no,
				shoestyle_codefactory AS factory_shoes_style, cust_shoestyle AS cust_shoes_style,
				factory_code_produce, wuerp_vnrd.dbo.NORMALIZE_SIZE_NUMBER(size_numcode) AS size_numcode, color_sn
			FROM DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust
			WHERE ISNULL(mo_no_actual, mo_no) IN (${placeholders})
			${options.maxRows !== undefined ? 'ORDER BY EPC_Code' : ''};
		`
		const selectedOrders = new Set(orders)
		const seen = new Set<string>()
		let operations: mongo.AnyBulkWriteOperation[] = []
		const queue = createEpcBatchQueue(concurrency, async (batch: mongo.AnyBulkWriteOperation[]) => {
			const chunkNumber = ++chunk
			const started = performance.now()
			try {
				for (let offset = 0; offset < batch.length; offset += batchSize) {
					const part = batch.slice(offset, offset + batchSize)
					const keys = part.map((operation) => {
						const epc =
							'updateOne' in operation
								? operation.updateOne.filter.epc
								: 'insertOne' in operation
									? operation.insertOne.document.epc
									: undefined
						if (typeof epc !== 'string') throw new Error('Invalid EPC match batch operation')
						return { insertOne: { document: { _id: epc } } }
					})
					const tracked = await tracker.bulkWrite(keys, { ordered: false })
					if (!tracked.isOk()) throw new Error('Failed EPC match duplicate tracking batch')
					trackerCreated = true
					const result = await matches.bulkWrite(part, { ordered: false })
					if (!result.isOk()) throw new Error('Failed EPC match batch')
				}
				console.info('EPC match chunk', {
					chunk: chunkNumber,
					rows: batch.length,
					elapsedMs: performance.now() - started,
					errors: 0
				})
			} catch (error) {
				const errors =
					error && typeof error === 'object' && 'writeErrors' in error && Array.isArray(error.writeErrors)
						? error.writeErrors.length
						: null
				console.error('EPC match chunk failed', {
					chunk: chunkNumber,
					rows: batch.length,
					elapsedMs: performance.now() - started,
					errors,
					error
				})
				throw error
			}
		})
		try {
			for await (const row of streamMssqlRows(pool.request(), sql, parameters)) {
				if (!row || typeof row !== 'object') throw new Error('Invalid EPC match row')
				if (!(
					'epc' in row &&
					'mo_no' in row &&
					'factory_shoes_style' in row &&
					'cust_shoes_style' in row &&
					'factory_code_produce' in row &&
					'size_numcode' in row &&
					'color_sn' in row
				))
					throw new Error('Incomplete EPC match row')
				const epc = requiredText(row.epc, 'epc')
				const mo_no = requiredText(row.mo_no, 'mo_no')
				if (!selectedOrders.has(mo_no) || seen.has(epc)) throw new Error(`Unexpected or duplicate EPC match ${epc}`)
				seen.add(epc)
				const now = new Date()
				const fields = {
					factory_shoes_style: requiredText(row.factory_shoes_style, 'factory_shoes_style'),
					cust_shoes_style: requiredText(row.cust_shoes_style, 'cust_shoes_style'),
					factory_code_produce: requiredText(row.factory_code_produce, 'factory_code_produce'),
					size_numcode: requiredText(row.size_numcode, 'size_numcode'),
					color_sn: requiredText(row.color_sn, 'color_sn'),
					updated_at: now
				}
				if (options.writeMode === 'insert') {
					operations.push({ insertOne: { document: { epc, mo_no, ...fields, created_at: now } } })
				} else {
					operations.push({
						updateOne: {
							filter: { epc, mo_no },
							update: { $set: fields, $setOnInsert: { created_at: now } },
							upsert: true
						}
					})
				}
				if (operations.length >= chunkSize) {
					await queue.submit(operations)
					operations = []
					seen.clear()
				}
				epcMatches++
				if (options.maxRows !== undefined && epcMatches >= options.maxRows) break
			}
			if (operations.length) {
				await queue.submit(operations)
			}
		} catch (error) {
			try {
				await queue.close()
			} catch (writeError) {
				if (writeError !== error) throw new AggregateError([error, writeError], 'EPC match stream and write failed')
			}
			throw error
		}
		await queue.close()
	}

	try {
		for await (const order of cursor) {
			orderBatch.push(requiredText(order.mo_no, 'mo_no'))
			moCount++
			if (orderBatch.length === 100) {
				await processBatch(orderBatch)
				orderBatch = []
				if (options.maxRows !== undefined && epcMatches >= options.maxRows) break
			}
		}
		if (orderBatch.length) await processBatch(orderBatch)
	} finally {
		await cursor.close()
	}
	if (!moCount) throw new Error('No manufacturing orders found for EPC matches')
	if (trackerCreated) await tracker.drop()
	return { epcMatches }
}
