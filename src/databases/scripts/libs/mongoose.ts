import 'dotenv/config'
import mongoose, { Document } from 'mongoose'
import { env } from '../../../common/utils'
import { Logger } from '../utils/logger'

export class MongoManager {
	private client: mongoose.Mongoose = new mongoose.Mongoose({ createInitialConnection: false })
	private readonly logger = new Logger('MongoDB')

	constructor(private readonly dbName: string = process.env.MONGO_DB_NAME) {}

	public async connect() {
		try {
			this.logger.info('Connecting to MongoDB...')
			this.client = await this.client.connect(env('MONGO_URI'), {
				dbName: this.dbName,
				replicaSet: 'rs0'
			})
			this.logger.info('Connected to MongoDB')
		} catch {
			this.logger.error('Failed to connect to MongoDB')
			process.exit(1)
		}
	}

	public async disconnect() {
		if (this.client.connection.readyState === 1) {
			this.logger.info('Disconnecting from MongoDB...')
			await this.client.disconnect()
			this.logger.info('Disconnected from MongoDB')
		}
	}

	public getDatabase() {
		if (!this.client.connection.db) throw new Error('MongoDB is not connected')
		return this.client.connection.db
	}

	public getRepository<T extends Document>(collection: string) {
		if (this.client.connection.readyState !== 1) throw new Error('MongoDB is not connected')
		const database = this.client.connection.db
		return database.collection<T>(collection)
	}

	public getBucket(bucketName: string) {
		if (this.client.connection.readyState !== 1) throw new Error('MongoDB is not connected')
		const database = this.client.connection.db
		return new mongoose.mongo.GridFSBucket(database, { bucketName })
	}

	public async withTransaction(fn: (session: mongoose.ClientSession) => Promise<void>) {
		if (this.client instanceof mongoose.Mongoose) {
			const session = await this.client.startSession()
			try {
				await session.withTransaction(async () => {
					await fn(session)
				})
			} finally {
				await session.endSession()
			}
		}
	}

	public
}
