import 'dotenv/config'
import mongoose from 'mongoose'
import { Logger } from '../../../../.tmp/utils/logger'

export class MongoManager {
	private client: mongoose.Mongoose = new mongoose.Mongoose({ createInitialConnection: false })

	public async connect(db: string = 'data_warehouse') {
		const logger = new Logger('MongoDB')

		try {
			logger.info('Connecting to MongoDB...')
			this.client = await this.client.connect(
				`mongodb://127.0.0.1:27017,127.0.0.1:27018,127.0.0.1:27019/${db}?replicaSet=rs0`
			)
			logger.info('Connected to MongoDB')
		} catch {
			logger.error('Failed to connect to MongoDB')
			process.exit(1)
		}
	}

	public async disconnect() {
		if (this.client.connection.readyState === 1) await this.client.disconnect()
	}

	public getRepository(collection: string) {
		if (this.client.connection.readyState !== 1) throw new Error('MongoDB is not connected')
		const database = this.client.connection.db!
		return database.collection(collection)
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
}
