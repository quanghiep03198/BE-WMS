/**
 * One-off migration: moves base64 signatures of `truckload_delivery` into GridFS and replaces them with file ids.
 * Idempotent: only fields still holding a string are processed.
 *
 * Usage: npx ts-node --transpile-only src/databases/scripts/migrate-truckload-signatures-to-gridfs.ts [--dry-run]
 */
import mongoose from 'mongoose'

const FIELDS = ['ie_signature', 'warehouse_officer_signature', 'security_1_signature', 'security_2_signature']
const BUCKET_NAME = 'dispatch_order_signatures'
const DATA_URL_PATTERN = /^data:(image\/[\w.+-]+);base64,/

async function main() {
	try {
		process.loadEnvFile('.env')
	} catch {
		// * Variables may already be provided by the environment
	}
	const dryRun = process.argv.includes('--dry-run')
	await mongoose.connect(process.env.MONGO_URI as string, { dbName: process.env.MONGO_DB_NAME })
	const db = mongoose.connection.db as mongoose.mongo.Db
	const collection = db.collection('truckload_delivery')
	const bucket = new mongoose.mongo.GridFSBucket(db, { bucketName: BUCKET_NAME })

	const cursor = collection.find(
		{ $or: FIELDS.map((field) => ({ [field]: { $type: 'string' } })) },
		{ projection: Object.fromEntries(['dispatch_order', ...FIELDS].map((f) => [f, 1])) }
	)

	let documents = 0
	let uploaded = 0
	let cleared = 0
	for await (const doc of cursor) {
		const $set: Record<string, mongoose.mongo.ObjectId | null> = {}
		for (const field of FIELDS) {
			const value = doc[field]
			if (typeof value !== 'string') continue
			const base64 = value.replace(DATA_URL_PATTERN, '')
			if (!base64.trim()) {
				$set[field] = null
				cleared++
				continue
			}
			const contentType = DATA_URL_PATTERN.exec(value)?.[1] ?? 'image/png'
			if (dryRun) {
				uploaded++
				continue
			}
			const stream = bucket.openUploadStream(`${doc.dispatch_order}.${field}`, { metadata: { contentType } })
			await new Promise<void>((resolve, reject) => {
				stream.once('finish', () => resolve())
				stream.once('error', reject)
				stream.end(Buffer.from(base64, 'base64'))
			})
			$set[field] = stream.id as mongoose.mongo.ObjectId
			uploaded++
		}
		documents++
		// * Written only after every upload of the document succeeded; the string check keeps reruns safe
		if (!dryRun && Object.keys($set).length > 0) await collection.updateOne({ _id: doc._id }, { $set })
	}

	console.log(`${dryRun ? '[dry-run] ' : ''}documents: ${documents}, uploaded: ${uploaded}, cleared empty: ${cleared}`)
	await mongoose.disconnect()
}

main().catch((error) => {
	console.error(error)
	process.exit(1)
})
