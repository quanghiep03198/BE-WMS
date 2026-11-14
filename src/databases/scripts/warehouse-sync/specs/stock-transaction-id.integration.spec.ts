import { StockTransactionIdMongoGenerator } from '@modules/finished-goods/infrastructure/persistence/mongodb/repositories/stock-transaction-id-mongo.generator'
import {
	StockTransactionSequence,
	StockTransactionSequenceSchema
} from '@modules/finished-goods/infrastructure/persistence/mongodb/schemas/stock-transaction-sequence.schema'
import mongoose from 'mongoose'
import { randomUUID } from 'node:crypto'

const uri = process.env.WAREHOUSE_SYNC_TEST_MONGO_URI
const integration = uri ? describe : describe.skip

integration('warehouse sync stock transaction IDs', () => {
	it('shares daily counters with the application generator in the selected database', async () => {
		const connection = await mongoose
			.createConnection(uri, { dbName: `warehouse_sync_ids_${randomUUID().replaceAll('-', '')}` })
			.asPromise()
		try {
			if (!connection.db) throw new Error('MongoDB is not connected')
			const application = new StockTransactionIdMongoGenerator(
				connection.model(StockTransactionSequence.name, StockTransactionSequenceSchema)
			)
			const sync = StockTransactionIdMongoGenerator.fromDatabase(connection.db)
			const date = new Date(2026, 10, 11, 12)
			expect(await application.nextId('stock_in', date)).toBe('SI-261111-001')
			expect(await sync.nextId('stock_in', date)).toBe('SI-261111-002')
			expect(await sync.nextId('stock_out', date)).toBe('XF-261111-001')
			expect(await sync.nextId('stock_in', new Date(2026, 10, 12, 12))).toBe('SI-261112-001')
		} finally {
			await connection.dropDatabase()
			await connection.close()
		}
	})
})
