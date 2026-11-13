import { type mongo } from 'mongoose'
import type { DailyPoProgress, OutboundScan } from './daily-po-progress'
import { syncDailyPoProgress } from './sync-daily-po-progress'

const MIGRATION_SOURCE = 'mssql-outbound-scans-by-minute'

type StoredDailyPoProgress = DailyPoProgress & {
	migration_source?: string
	created_at?: Date
	updated_at?: Date
}

export async function syncMongoDailyPoProgress(
	database: mongo.Db,
	scans: Iterable<OutboundScan> | AsyncIterable<OutboundScan>,
	generateId: () => string
) {
	const ledgers = database.collection<StoredDailyPoProgress>('daily_po_shipping_progress')
	const purchaseOrders = database.collection<{ po: string }>('purchase_orders')
	const manufacturingOrders = database.collection<{ mo_no: string }>('manufacturing_orders')
	await ledgers.createIndex({ date: 1, po: 1 }, { unique: true, name: 'idx_date_po' })

	return syncDailyPoProgress(
		scans,
		{
			async find(po, date) {
				const document = await ledgers.findOne({ po, date })
				if (!document) return undefined
				if (document.migration_source !== MIGRATION_SOURCE) {
					throw new Error(`PO ledger ${po} ${date} was not created by this migration`)
				}
				return document
			},
			async save(document) {
				if (!(await purchaseOrders.findOne({ po: document.po }, { projection: { _id: 1 } }))) {
					throw new Error(`Missing purchase order ${document.po}`)
				}
				const moNumbers = Object.keys(document.shipping_progress)
				const matches = await manufacturingOrders
					.find({ mo_no: { $in: moNumbers } }, { projection: { _id: 0, mo_no: 1 } })
					.toArray()
				const found = new Set(matches.map((order) => order.mo_no))
				const missing = moNumbers.find((mo) => !found.has(mo))
				if (missing) throw new Error(`Missing manufacturing order ${missing}`)
				const now = new Date()
				const result = await ledgers.updateOne(
					{ po: document.po, date: document.date, migration_source: MIGRATION_SOURCE },
					{
						$set: {
							shipping_progress: document.shipping_progress,
							transaction_history: document.transaction_history,
							updated_at: now
						},
						$setOnInsert: { created_at: now }
					},
					{ upsert: true }
				)
				if (!result.acknowledged) throw new Error(`Unacknowledged PO ledger write: ${document.po} ${document.date}`)
			}
		},
		generateId
	)
}
