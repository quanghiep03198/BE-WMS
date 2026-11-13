import mongoose from 'mongoose'
import { randomUUID } from 'node:crypto'
import { StockTransactionSequence, StockTransactionSequenceSchema } from '../schemas/stock-transaction-sequence.schema'
import { StockTransactionIdMongoGenerator } from './stock-transaction-id-mongo.generator'

const uri = process.env.STOCK_TX_TEST_MONGO_URI
const integration = uri ? describe : describe.skip

integration('StockTransactionIdMongoGenerator with MongoDB', () => {
	it('allocates distinct consecutive IDs across instances under concurrent initial upserts', async () => {
		const connection = await mongoose
			.createConnection(uri, { dbName: `stock_tx_id_test_${randomUUID().replaceAll('-', '')}` })
			.asPromise()
		try {
			const model = connection.model(StockTransactionSequence.name, StockTransactionSequenceSchema)
			const first = new StockTransactionIdMongoGenerator(model)
			const second = new StockTransactionIdMongoGenerator(model)
			const ids = await Promise.all(
				Array.from({ length: 100 }, (_, index) => (index % 2 ? first : second).nextId('stock_in'))
			)

			expect(new Set(ids).size).toBe(100)
			expect(ids.map((id) => Number(id.split('-')[2])).sort((a, b) => a - b)).toEqual(
				Array.from({ length: 100 }, (_, index) => index + 1)
			)
			expect(new Set(ids.map((id) => id.slice(0, 9))).size).toBe(1)
		} finally {
			await connection.dropDatabase()
			await connection.close()
		}
	})
})
