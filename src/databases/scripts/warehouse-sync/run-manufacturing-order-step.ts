import type { mongo } from 'mongoose'
import { orderSearchGrams } from '../../../modules/order/order-search-grams'
import { getVietnamCutoffSqlDate } from './cutoff'
import { MANUFACTURING_ORDERS_SQL } from './manufacturing-orders.sql'
import { streamMssqlRows, type MssqlStreamRequest } from './mssql-stream'

function requiredText(value: unknown, name: string): string {
	if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid manufacturing order ${name}`)
	return value.trim()
}

function sizeLedger(value: unknown, moNo: string): Record<string, Record<string, number>> {
	if (typeof value !== 'string') throw new Error(`Invalid size ledger for ${moNo}`)
	const parsed: unknown = JSON.parse(value)
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
		throw new Error(`Invalid size ledger for ${moNo}`)
	const result: Record<string, Record<string, number>> = {}
	for (const [size, entry] of Object.entries(parsed)) {
		if (!size || !entry || typeof entry !== 'object' || Array.isArray(entry)) {
			throw new Error(`Invalid size ledger entry for ${moNo}`)
		}
		const quantities: Record<string, number> = {}
		for (const field of ['order_qty', 'stocked_in_qty', 'total_recall_tx', 'total_return_tx', 'shipped_out_qty']) {
			if (!(field in entry) || typeof entry[field] !== 'number' || !Number.isFinite(entry[field])) {
				throw new Error(`Invalid ${field} for ${moNo}, size ${size}`)
			}
			quantities[field] = entry[field]
		}
		result[size] = quantities
	}
	return result
}

export async function runManufacturingOrderStep(
	pool: { request(): MssqlStreamRequest },
	database: mongo.Db,
	factoryCode: string,
	cutoff: Date,
	prefix: string
): Promise<{ manufacturingOrders: number }> {
	if (!factoryCode.trim()) throw new Error('Factory code is required')
	if (!/^\d{2}$/.test(prefix)) throw new Error('Manufacturing order prefix must be a two-digit number')
	const cutoffDate = getVietnamCutoffSqlDate(cutoff)
	const collection = database.collection('manufacturing_orders')
	await collection.createIndex({ mo_no: 1 }, { name: 'idx_mo', unique: true })
	await collection.createIndex({ search_ngrams: 1, mo_no: -1 }, { name: 'mo_search_ngrams_idx' })
	let manufacturingOrders = 0
	const seen = new Set<string>()
	let batch: mongo.AnyBulkWriteOperation[] = []
	for await (const row of streamMssqlRows(pool.request(), MANUFACTURING_ORDERS_SQL, {
		FactoryCode: factoryCode,
		MoPrefix: prefix,
		cutoff: cutoffDate
	})) {
		if (!row || typeof row !== 'object') throw new Error('Invalid manufacturing order row')
		if (!(
			'mo_no' in row &&
			'brand_name' in row &&
			'factory_code_produce' in row &&
			'factory_shoes_style' in row &&
			'cust_shoes_style' in row &&
			'color_sn' in row &&
			'order_qty' in row &&
			'size_ledger' in row
		))
			throw new Error('Incomplete manufacturing order row')
		const mo_no = requiredText(row.mo_no, 'mo_no')
		if (!mo_no.startsWith(prefix) || seen.has(mo_no)) throw new Error(`Unexpected or duplicate MO ${mo_no}`)
		seen.add(mo_no)
		if (typeof row.order_qty !== 'number' || !Number.isFinite(row.order_qty)) {
			throw new Error(`Invalid order_qty for ${mo_no}`)
		}
		const now = new Date()
		batch.push({
			updateOne: {
				filter: { mo_no },
				update: {
					$set: {
						brand_name: requiredText(row.brand_name, 'brand_name'),
						factory_code_produce: requiredText(row.factory_code_produce, 'factory_code_produce'),
						factory_shoes_style: requiredText(row.factory_shoes_style, 'factory_shoes_style'),
						cust_shoes_style: requiredText(row.cust_shoes_style, 'cust_shoes_style'),
						color_sn: requiredText(row.color_sn, 'color_sn'),
						order_qty: row.order_qty,
						size_ledger: sizeLedger(row.size_ledger, mo_no),
						search_ngrams: orderSearchGrams(mo_no),
						updated_at: now
					},
					$setOnInsert: { created_at: now }
				},
				upsert: true
			}
		})
		if (batch.length >= 100) {
			const result = await collection.bulkWrite(batch)
			if (!result.isOk()) throw new Error(`Failed MO batch for prefix ${prefix}`)
			batch = []
		}
		manufacturingOrders++
	}
	if (batch.length) {
		const result = await collection.bulkWrite(batch)
		if (!result.isOk()) throw new Error(`Failed MO batch for prefix ${prefix}`)
	}
	if (!manufacturingOrders) {
		console.warn(
			`No manufacturing orders matched prefix ${prefix} and factory ${factoryCode}; check source data and filters`
		)
	}
	return { manufacturingOrders }
}
