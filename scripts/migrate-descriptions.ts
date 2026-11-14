import { Queue } from 'bullmq'
import 'dotenv/config'
import mongoose, { Types } from 'mongoose'
import { createHash } from 'node:crypto'
import { DEFECTIVE_GOODS_SYNC_QUEUE } from '../src/modules/defective-goods/infrastructure/queues'
import { FilesService } from '../src/modules/files/files.service'
import { HtmlSanitizerService } from '../src/modules/files/html-sanitizer.service'
import { migrateLegacyDescription } from '../src/modules/files/legacy-description'
import { StoredFileSchema } from '../src/modules/files/stored-file.schema'

async function run() {
	const dryRun = process.argv.includes('--dry-run')
	const ownerArgument = process.argv.find((arg) => arg.startsWith('--owner-id='))?.slice('--owner-id='.length)
	if (ownerArgument && !/^[a-f0-9]{24}$/.test(ownerArgument)) throw new Error('Invalid --owner-id')
	if (!process.env.MONGO_URI || !process.env.MONGO_DB_NAME) throw new Error('MONGO_URI and MONGO_DB_NAME are required')
	if (!dryRun && (!process.env.REDIS_HOST || !process.env.REDIS_PORT))
		throw new Error('Redis configuration is required')

	const connection = await mongoose
		.createConnection(process.env.MONGO_URI, {
			dbName: process.env.MONGO_DB_NAME,
			replicaSet: process.env.MONGO_REPLICA_SET || 'rs0'
		})
		.asPromise()
	const metadata = connection.model('StoredFile', StoredFileSchema)
	const files = new FilesService(connection, metadata)
	const sanitizer = new HtmlSanitizerService()
	const collection = connection.db.collection('defective_goods')
	const queue = dryRun
		? null
		: new Queue(DEFECTIVE_GOODS_SYNC_QUEUE, {
				connection: {
					host: process.env.REDIS_HOST,
					port: Number(process.env.REDIS_PORT),
					password: process.env.REDIS_PASSWORD,
					db: Number(process.env.REDIS_DB || 0)
				}
			})
	if (queue) {
		queue.on('error', (error) => console.error('Migration queue error:', error))
	}

	async function enqueuePending() {
		const cursor = collection.find({ description_sync_pending: true }).project({ _id: 1 }).batchSize(500)
		for await (const document of cursor) {
			await queue.add(
				'SYNC_DEFECTIVE_GOODS',
				{ syncIds: [document._id.toString()] },
				{
					attempts: 5,
					backoff: { type: 'exponential', delay: 3000 },
					removeOnComplete: true,
					removeOnFail: false
				}
			)
			await collection.updateOne(
				{ _id: document._id, description_sync_pending: true },
				{ $unset: { description_sync_pending: '' } }
			)
		}
	}

	async function main() {
		if (queue) await enqueuePending()
		let processed = 0
		const cursor = collection.find({ description_image_ids: { $exists: false } }).batchSize(500)
		for await (const document of cursor) {
			const description = document.defective_description
			if (typeof description !== 'string' && !Buffer.isBuffer(description)) {
				throw new Error(`Invalid description for ${document._id}`)
			}
			const owner =
				document.created_by instanceof Types.ObjectId
					? document.created_by
					: typeof document.created_by === 'string' && /^[a-f0-9]{24}$/i.test(document.created_by)
						? new Types.ObjectId(document.created_by)
						: ownerArgument
							? new Types.ObjectId(ownerArgument)
							: null
			let result: { html: string; imageIds: string[] }
			try {
				result = await migrateLegacyDescription(description, owner, files, sanitizer, dryRun)
			} catch (error) {
				throw new Error(
					`Failed to migrate description for ${document._id}: ${error instanceof Error ? error.message : String(error)}`,
					{ cause: error }
				)
			}
			if (!dryRun) {
				const session = await connection.startSession()
				try {
					await session.withTransaction(
						async () => {
							const updated = await collection.updateOne(
								{
									_id: document._id,
									defective_description: description,
									description_image_ids: { $exists: false }
								},
								{
									$set: {
										defective_description: result.html,
										description_image_ids: result.imageIds,
										description_sync_pending: true,
										description_legacy_hash: createHash('sha256').update(description).digest('hex')
									}
								},
								{ session }
							)
							if (!updated.modifiedCount) throw new Error(`Document changed during migration: ${document._id}`)
							await files.syncImageRefs(`defective-goods:${document._id}`, [], result.imageIds, session)
						},
						{ readPreference: 'primary' }
					)
				} finally {
					await session.endSession()
				}
			}
			processed++
			if (processed % 500 === 0) console.log(`Processed ${processed} descriptions`)
		}
		if (queue) await enqueuePending()
		console.log(`${dryRun ? 'Would migrate' : 'Migrated'} ${processed} descriptions`)
	}

	try {
		if (queue) await queue.waitUntilReady()
		await main()
	} finally {
		if (queue) await queue.close()
		await connection.close()
	}
}

run().catch((error: unknown) => {
	console.error('Migration failed:', error)
	process.exitCode = 1
})
