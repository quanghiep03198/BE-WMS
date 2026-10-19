/**
 * One-off migration: moves base64 signatures of `truckload_delivery` into GridFS and replaces them with file ids.
 * Idempotent: only fields still holding a string are processed.
 *
 * Usage: npx ts-node --transpile-only src/databases/scripts/migrate-truckload-signatures-to-gridfs.ts [--dry-run]
 */
import 'dotenv/config'
import mongoose from 'mongoose'
import { TruckloadDeliveryDocument } from '../../modules/truckload-delivery/infrastructure/persistence/mongodb/schemas/truckload-delivery.schema'
import { MongoManager } from './libs/mongoose'
import { getArgs } from './utils/get-args'
import { Logger } from './utils/logger'

const FIELDS = ['ie_signature', 'warehouse_officer_signature', 'security_1_signature', 'security_2_signature']
const BUCKET_NAME = 'dispatch_order_signatures'
const DATA_URL_PATTERN = /^data:(image\/[\w.+-]+);base64,/

const args = getArgs({
	mongoDbName: {
		type: 'string',
		description: 'Name of the database to connect to',
		short: 'd',
		default: process.env.MONGO_DB_NAME
	}
})

async function execute() {
	const logger = new Logger('MigrateTruckloadSignaturesToGridFS')
	const mongoManager = new MongoManager(args.mongoDbName)

	try {
		await mongoManager.connect()
		const dryRun = process.argv.includes('--dry-run')
		const collection = mongoManager.getRepository<TruckloadDeliveryDocument>('truckload_delivery')
		const bucket = mongoManager.getBucket(BUCKET_NAME)

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

		logger.info(
			`${dryRun ? '[dry-run] ' : ''}documents: ${documents}, uploaded: ${uploaded}, cleared empty: ${cleared}`
		)
		await mongoose.disconnect()
	} catch (error) {
		process.exitCode = 1
	} finally {
		await mongoose.disconnect()
	}
}

execute().catch((error) => {
	console.error(error)
	process.exit(1)
})
