/**
 * One-off migration: moves base64 signatures of `truckload_delivery` into GridFS and replaces them with file ids.
 * Idempotent: only fields still holding a string are processed.
 *
 * Usage: npx ts-node --transpile-only src/databases/scripts/migrate-truckload-signatures-to-gridfs.ts [--dry-run]
 */
import 'dotenv/config'
import mongoose from 'mongoose'
import {
	DISPATCH_ORDER_SIGNATURE_FIELDS,
	SIGNATURE_BUCKET_NAME
} from '../../modules/truckload-delivery/domain/constants'
import { TruckloadDeliveryDocument } from '../../modules/truckload-delivery/infrastructure/persistence/mongodb/schemas/truckload-delivery.schema'
import { MongoManager } from './libs/mongoose'
import { decodeTruckloadSignature, uploadTruckloadSignature } from './libs/truckload-signatures'
import { getArgs } from './utils/get-args'
import { Logger } from './utils/logger'

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
		const bucket = mongoManager.getBucket(SIGNATURE_BUCKET_NAME)

		const cursor = collection.find(
			{ $or: DISPATCH_ORDER_SIGNATURE_FIELDS.map((field) => ({ [field]: { $type: 'string' } })) },
			{ projection: Object.fromEntries(['dispatch_order', ...DISPATCH_ORDER_SIGNATURE_FIELDS].map((f) => [f, 1])) }
		)

		let documents = 0
		let migrated = 0
		let cleared = 0
		for await (const doc of cursor) {
			const $set: Record<string, mongoose.mongo.ObjectId | null> = {}
			for (const field of DISPATCH_ORDER_SIGNATURE_FIELDS) {
				const value = doc[field]
				if (typeof value !== 'string') continue
				const signature = decodeTruckloadSignature(value, `${doc.dispatch_order}.${field}`)
				if (!signature) {
					$set[field] = null
					cleared++
					continue
				}
				if (dryRun) {
					migrated++
					continue
				}
				$set[field] = await uploadTruckloadSignature(bucket, `${doc.dispatch_order}.${field}`, signature)
				migrated++
			}
			documents++
			// * Written only after every upload of the document succeeded; the string check keeps reruns safe
			if (!dryRun && Object.keys($set).length > 0) await collection.updateOne({ _id: doc._id }, { $set })
		}

		logger.info(
			`${dryRun ? '[dry-run] ' : ''}documents: ${documents}, migrated signatures: ${migrated}, cleared empty: ${cleared}`
		)
	} catch (error) {
		logger.error(error instanceof Error ? error : 'Failed to migrate truckload signatures')
		process.exitCode = 1
	} finally {
		await mongoManager.disconnect()
	}
}

execute().catch((error) => {
	console.error(error)
	process.exit(1)
})
