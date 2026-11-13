import type { mongo } from 'mongoose'
import { orderSearchGrams } from '../../../modules/order/order-search-grams'
import { getVietnamCutoffSqlDate } from './cutoff'
import { streamMssqlRows, type MssqlStreamRequest } from './mssql-stream'
import { PURCHASE_ORDERS_SQL } from './purchase-orders.sql'

function text(value: unknown, name: string): string {
	if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid purchase order ${name}`)
	return value.trim()
}

function parseMap(value: unknown, name: string): Record<string, unknown> {
	if (typeof value !== 'string') throw new Error(`Invalid purchase order ${name}`)
	const parsed: unknown = JSON.parse(value)
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error(`Invalid purchase order ${name}`)
	}
	return Object.fromEntries(Object.entries(parsed))
}

function validatePacking(value: unknown, po: string): Record<string, Record<string, number>> {
	const packing = parseMap(value, `packing for ${po}`)
	const result: Record<string, Record<string, number>> = {}
	for (const [mo, sizes] of Object.entries(packing)) {
		if (!mo || !sizes || typeof sizes !== 'object' || Array.isArray(sizes)) {
			throw new Error(`Invalid packing for ${po}`)
		}
		const entries: Record<string, number> = {}
		for (const [size, quantity] of Object.entries(sizes)) {
			if (!size || typeof quantity !== 'number' || !Number.isFinite(quantity)) {
				throw new Error(`Invalid packing quantity for ${po}`)
			}
			entries[size] = quantity
		}
		result[mo] = entries
	}
	return result
}

function validateProgress(value: unknown, po: string): Record<string, { order_qty: number; shipped_out_qty: number }> {
	const progress = parseMap(value, `shipping progress for ${po}`)
	const result: Record<string, { order_qty: number; shipped_out_qty: number }> = {}
	for (const [size, quantities] of Object.entries(progress)) {
		if (
			!size ||
			!quantities ||
			typeof quantities !== 'object' ||
			!('order_qty' in quantities && 'shipped_out_qty' in quantities) ||
			typeof quantities.order_qty !== 'number' ||
			!Number.isFinite(quantities.order_qty) ||
			typeof quantities.shipped_out_qty !== 'number' ||
			!Number.isFinite(quantities.shipped_out_qty)
		) {
			throw new Error(`Invalid shipping progress for ${po}`)
		}
		result[size] = { order_qty: quantities.order_qty, shipped_out_qty: quantities.shipped_out_qty }
	}
	return result
}

export async function runPurchaseOrderStep(
	pool: { request(): MssqlStreamRequest },
	database: mongo.Db,
	cutoff: Date
): Promise<{ purchaseOrders: number }> {
	const cutoffDate = getVietnamCutoffSqlDate(cutoff)
	const collection = database.collection('purchase_orders')
	await collection.createIndex({ po: 1 }, { name: 'po_idx', unique: true })
	await collection.createIndex({ search_ngrams: 1, po: 1 }, { name: 'po_search_ngrams_idx' })
	const seen = new Set<string>()
	let operations: mongo.AnyBulkWriteOperation[] = []
	for await (const row of streamMssqlRows(pool.request(), PURCHASE_ORDERS_SQL, { cutoff: cutoffDate })) {
		if (
			!row ||
			typeof row !== 'object' ||
			!(
				'po' in row &&
				'order_qty' in row &&
				'shipping_method' in row &&
				'shipping_destination' in row &&
				'brand_name' in row &&
				'factory_shoes_style' in row &&
				'cust_shoes_style' in row &&
				'color_sn' in row &&
				'packing' in row &&
				'shipping_progress' in row
			)
		) {
			throw new Error('Invalid purchase order row')
		}
		const po = text(row.po, 'po')
		seen.add(po)
		if (typeof row.order_qty !== 'number' || !Number.isFinite(row.order_qty)) {
			throw new Error(`Invalid order quantity for ${po}`)
		}
		if (row.shipping_method !== null && row.shipping_method !== 'AIR' && row.shipping_method !== 'OCEAN') {
			throw new Error(`Invalid shipping method for ${po}`)
		}
		const now = new Date()
		operations.push({
			updateOne: {
				filter: { po },
				update: {
					$set: {
						order_qty: row.order_qty,
						...(row.shipping_method === null ? {} : { shipping_method: row.shipping_method }),
						...(row.shipping_destination === null
							? {}
							: { shipping_destination: text(row.shipping_destination, 'shipping_destination') }),
						brand_name: text(row.brand_name, 'brand_name'),
						factory_shoes_style: text(row.factory_shoes_style, 'factory_shoes_style'),
						cust_shoes_style: text(row.cust_shoes_style, 'cust_shoes_style'),
						color_sn: text(row.color_sn, 'color_sn'),
						packing: validatePacking(row.packing, po),
						shipping_progress: validateProgress(row.shipping_progress, po),
						search_ngrams: orderSearchGrams(po),
						updated_at: now
					},
					$setOnInsert: {
						created_at: now,
						...(row.shipping_method === null ? { shipping_method: null } : {}),
						...(row.shipping_destination === null ? { shipping_destination: null } : {})
					}
				},
				upsert: true
			}
		})
		if (operations.length >= 100) {
			const result = await collection.bulkWrite(operations)
			if (!result.isOk()) throw new Error('Failed purchase order batch')
			operations = []
		}
	}
	if (operations.length) {
		const result = await collection.bulkWrite(operations)
		if (!result.isOk()) throw new Error('Failed purchase order batch')
	}
	return { purchaseOrders: seen.size }
}
