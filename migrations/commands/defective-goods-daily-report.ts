import { defectiveGoodsDailyReportPipeline } from '@modules/defective-goods/infrastructure/persistence/mongodb/repositories/defective-goods-report.pipeline'
import type { ClientSession, mongo } from 'mongoose'

export async function rebuildDefectiveGoodsDailyReports(
	database: mongo.Db,
	withTransaction: (operation: (session: ClientSession) => Promise<void>) => Promise<void>,
	sourceCollection: string
): Promise<void> {
	const goods = database.collection(sourceCollection)
	const reports = database.collection('defective_goods_daily_report')
	await reports.createIndex({ date: 1, type: 1 })

	for (const type of ['inbound', 'outbound'] as const) {
		const dateField = type === 'inbound' ? 'inbound_at' : 'outbound_at'
		const dates = await goods
			.aggregate<{ _id: string }>([
				{ $match: { [dateField]: { $type: 'date' } } },
				{ $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: `$${dateField}` } } } },
				{ $sort: { _id: 1 } }
			])
			.toArray()

		const cursor = goods.aggregate([...defectiveGoodsDailyReportPipeline(type), { $sort: { date: 1 } }], {
			allowDiskUse: true
		})
		try {
			let next = await cursor.next()
			for (const { _id: date } of dates) {
				const documents: mongo.Document[] = []
				const now = new Date()
				while (next && next.date === date) {
					const { total_qty: _totalQty, ...entry } = next
					documents.push({ ...entry, date, type, created_at: now, updated_at: now })
					next = await cursor.next()
				}

				await withTransaction(async (session) => {
					const deleted = await reports.deleteMany({ date, type }, { session })
					if (!deleted.acknowledged) {
						throw new Error(`Unacknowledged defective goods report deletion for ${date} ${type}`)
					}
					if (documents.length) {
						const inserted = await reports.insertMany(documents, { session })
						if (!inserted.acknowledged) {
							throw new Error(`Unacknowledged defective goods report insertion for ${date} ${type}`)
						}
					}
				})
			}
			if (next) throw new Error(`Unexpected defective goods report date ${next.date}`)
		} finally {
			await cursor.close()
		}
	}
}
