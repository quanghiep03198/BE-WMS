import 'dotenv/config'
import mongoose, { type AnyBulkWriteOperation } from 'mongoose'
import { orderSearchGrams } from '../src/modules/order/order-search-grams'

async function run() {
	if (!process.env.MONGO_URI || !process.env.MONGO_DB_NAME) {
		throw new Error('MONGO_URI and MONGO_DB_NAME are required')
	}
	const connection = await mongoose
		.createConnection(process.env.MONGO_URI, {
			dbName: process.env.MONGO_DB_NAME
		})
		.asPromise()
	try {
		for (const { collectionName, field, indexName, direction } of [
			{ collectionName: 'manufacturing_orders', field: 'mo_no', indexName: 'mo_search_ngrams_idx', direction: -1 },
			{ collectionName: 'purchase_orders', field: 'po', indexName: 'po_search_ngrams_idx', direction: 1 }
		] as const) {
			if (!connection?.db) throw new Error('Failed to create MongoDB connection')

			const collection = connection.db.collection(collectionName)
			let operations: AnyBulkWriteOperation<mongoose.mongo.Document>[] = []
			let total = 0
			async function flush() {
				if (!operations.length) return
				const result = await collection.bulkWrite(operations, { ordered: true })
				if (result.matchedCount !== operations.length) {
					throw new Error(`${collectionName}: identifiers changed during backfill; rerun the migration`)
				}
				total += operations.length
				operations = []
			}
			const cursor = collection.find({}, { projection: { [field]: 1 } }).batchSize(500)
			for await (const document of cursor) {
				const value = document[field]
				if (typeof value !== 'string') throw new Error(`${collectionName}: invalid ${field} in ${document._id}`)
				operations.push({
					updateOne: {
						filter: { _id: document._id, [field]: value },
						update: { $set: { search_ngrams: orderSearchGrams(value) } }
					}
				})
				if (operations.length === 500) await flush()
			}
			await flush()
			await collection.createIndex({ search_ngrams: 1, [field]: direction }, { name: indexName })
			console.log(`${collectionName}: backfilled ${total} documents and created ${indexName}`)
		}
	} finally {
		await connection.close()
	}
}

run().catch((error) => {
	console.error('Order search migration failed:', error)
	process.exitCode = 1
})
