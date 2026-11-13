import type { mongo } from 'mongoose'
import { streamMssqlRows, type MssqlStreamRequest } from './mssql-stream'

function requiredText(value: unknown, name: string): string {
	if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid EPC match ${name}`)
	return value.trim()
}

export async function runEpcMatchStep(
	pool: { request(): MssqlStreamRequest },
	database: mongo.Db
): Promise<{ epcMatches: number }> {
	const matches = database.collection('finished_goods_epcs_match')
	await matches.createIndex({ epc: 1 }, { name: 'idx_epc', unique: true })
	const cursor = database.collection<{ mo_no: string }>('manufacturing_orders').find({}, { projection: { mo_no: 1 } })
	let epcMatches = 0
	let moCount = 0
	let orderBatch: string[] = []

	async function processBatch(orders: string[]) {
		const parameters: Record<string, string> = {}
		for (const [index, order] of orders.entries()) parameters[`mo${index}`] = order
		const placeholders = Object.keys(parameters)
			.map((key) => `@${key}`)
			.join(', ')
		const sql = `
			SELECT EPC_Code AS epc, ISNULL(mo_no_actual, mo_no) AS mo_no,
				shoestyle_codefactory AS factory_shoes_style, cust_shoestyle AS cust_shoes_style,
				factory_code_produce, wuerp_vnrd.dbo.NORMALIZE_SIZE_NUMBER(size_numcode) AS size_numcode, color_sn
			FROM DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust
			WHERE ISNULL(mo_no_actual, mo_no) IN (${placeholders});
		`
		const selectedOrders = new Set(orders)
		const seen = new Set<string>()
		let operations: mongo.AnyBulkWriteOperation[] = []
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
			operations.push({
				updateOne: {
					filter: { epc, mo_no },
					update: {
						$set: {
							factory_shoes_style: requiredText(row.factory_shoes_style, 'factory_shoes_style'),
							cust_shoes_style: requiredText(row.cust_shoes_style, 'cust_shoes_style'),
							factory_code_produce: requiredText(row.factory_code_produce, 'factory_code_produce'),
							size_numcode: requiredText(row.size_numcode, 'size_numcode'),
							color_sn: requiredText(row.color_sn, 'color_sn'),
							updated_at: now
						},
						$setOnInsert: { created_at: now }
					},
					upsert: true
				}
			})
			if (operations.length >= 1000) {
				const result = await matches.bulkWrite(operations)
				if (!result.isOk()) throw new Error('Failed EPC match batch')
				operations = []
			}
			epcMatches++
		}
		if (operations.length) {
			const result = await matches.bulkWrite(operations)
			if (!result.isOk()) throw new Error('Failed EPC match batch')
		}
	}

	try {
		for await (const order of cursor) {
			orderBatch.push(requiredText(order.mo_no, 'mo_no'))
			moCount++
			if (orderBatch.length === 100) {
				await processBatch(orderBatch)
				orderBatch = []
			}
		}
		if (orderBatch.length) await processBatch(orderBatch)
	} finally {
		await cursor.close()
	}
	if (!moCount) throw new Error('No manufacturing orders found for EPC matches')
	return { epcMatches }
}
