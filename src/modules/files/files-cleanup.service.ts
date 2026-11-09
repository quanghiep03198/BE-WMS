import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq'
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectConnection, InjectModel } from '@nestjs/mongoose'
import { Queue } from 'bullmq'
import { Connection, Model, Types } from 'mongoose'
import { StoredFile } from './stored-file.schema'

export const FILES_CLEANUP_QUEUE = 'files-cleanup'
const BATCH_SIZE = 500
const CLAIM_LEASE_MS = 60 * 60 * 1000

export function cleanupEligibility(now: Date, pendingHours: number, orphanDays: number) {
	return {
		refs: { $size: 0 },
		$or: [
			{ status: 'pending', created_at: { $lt: new Date(now.getTime() - pendingHours * 60 * 60 * 1000) } },
			{ orphaned_at: { $lt: new Date(now.getTime() - orphanDays * 24 * 60 * 60 * 1000) } }
		]
	}
}

@Injectable()
export class FilesCleanupScheduler implements OnModuleInit {
	constructor(
		@InjectQueue(FILES_CLEANUP_QUEUE) private readonly queue: Queue,
		private readonly config: ConfigService
	) {}

	async onModuleInit() {
		await this.queue.upsertJobScheduler(
			'nightly-file-cleanup',
			{ pattern: this.config.get<string>('FILES_CLEANUP_CRON', '0 2 * * *'), tz: this.config.get<string>('TZ') },
			{ name: 'cleanup' }
		)
	}
}

@Processor(FILES_CLEANUP_QUEUE, { concurrency: 1 })
export class FilesCleanupProcessor extends WorkerHost {
	private readonly logger = new Logger(FilesCleanupProcessor.name)

	constructor(
		@InjectConnection(DATA_WAREHOUSE_CONNECTION) private readonly connection: Connection,
		@InjectModel(StoredFile.name, DATA_WAREHOUSE_CONNECTION) private readonly files: Model<StoredFile>,
		private readonly config: ConfigService
	) {
		super()
	}

	async process() {
		await this.reconcileExpiredEntities()
		let total = 0
		for (;;) {
			let batch = 0
			while (batch < BATCH_SIZE) {
				const now = new Date()
				const file = await this.files.findOneAndUpdate(
					{
						...cleanupEligibility(
							now,
							this.config.get<number>('FILES_PENDING_HOURS', 24),
							this.config.get<number>('FILES_ORPHAN_DAYS', 7)
						),
						$and: [
							{
								$or: [
									{ cleanup_started_at: { $exists: false } },
									{ cleanup_started_at: { $lt: new Date(now.getTime() - CLAIM_LEASE_MS) } }
								]
							}
						]
					},
					{ $set: { cleanup_started_at: now } },
					{ new: true, sort: { _id: 1 } }
				)
				if (!file) break
				await this.connection.db.collection('images.files').deleteOne({ _id: file.gridfs_id })
				await this.connection.db.collection('images.chunks').deleteMany({ files_id: file.gridfs_id })
				await this.files.deleteOne({ _id: file._id, cleanup_started_at: now })
				batch++
				total++
			}
			if (batch < BATCH_SIZE) break
		}
		this.logger.log(`Deleted ${total} stored images`)
	}

	private async reconcileExpiredEntities() {
		let after: Types.ObjectId | undefined
		for (;;) {
			const batch = await this.files
				.find({ status: 'attached', 'refs.0': { $exists: true }, ...(after && { _id: { $gt: after } }) })
				.sort({ _id: 1 })
				.limit(BATCH_SIZE)
				.select({ _id: 1 })
				.lean()
			if (!batch.length) break
			for (const item of batch) {
				const session = await this.connection.startSession()
				try {
					await session.withTransaction(
						async () => {
							const file = await this.files.findById(item._id).session(session).lean()
							if (!file) return
							const stale: string[] = []
							for (const ref of file.refs) {
								const match = /^defective-goods:([a-f0-9]{24})$/.exec(ref)
								if (!match) continue
								const owner = await this.connection.db
									.collection('defective_goods')
									.findOne(
										{ _id: new Types.ObjectId(match[1]), description_image_ids: file.gridfs_id.toString() },
										{ session, projection: { _id: 1 } }
									)
								if (!owner) stale.push(ref)
							}
							if (!stale.length) return
							await this.files.updateOne({ _id: item._id }, { $pull: { refs: { $in: stale } } }, { session })
							await this.files.updateOne(
								{ _id: item._id, refs: { $size: 0 }, orphaned_at: { $exists: false } },
								{ $set: { orphaned_at: new Date() } },
								{ session }
							)
						},
						{ readPreference: 'primary' }
					)
				} finally {
					await session.endSession()
				}
			}
			after = batch[batch.length - 1]._id
		}
	}
}
