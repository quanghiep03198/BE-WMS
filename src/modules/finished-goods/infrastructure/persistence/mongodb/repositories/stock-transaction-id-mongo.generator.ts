import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { IStockTransactionIdGenerator } from '@modules/finished-goods/application/ports/stock-transaction-id-generator.port'
import {
	formatStockTransactionId,
	stockTransactionIdKey,
	StockTransactionType
} from '@modules/finished-goods/domain/value-objects/stock-transaction-id'
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import mongoose, { type mongo } from 'mongoose'
import {
	StockTransactionSequence,
	type StockTransactionSequenceModel,
	StockTransactionSequenceSchema
} from '../schemas/stock-transaction-sequence.schema'

@Injectable()
export class StockTransactionIdMongoGenerator implements IStockTransactionIdGenerator {
	constructor(
		@InjectModel(StockTransactionSequence.name, DATA_WAREHOUSE_CONNECTION)
		private readonly sequences: StockTransactionSequenceModel
	) {}

	static fromDatabase(database: mongo.Db): StockTransactionIdMongoGenerator {
		const connection = new mongoose.Mongoose()
			.createConnection()
			.setClient(database.client)
			.useDb(database.databaseName)
		const model = connection.model(StockTransactionSequence.name, StockTransactionSequenceSchema)
		return new StockTransactionIdMongoGenerator(model)
	}

	async nextId(type: StockTransactionType, date = new Date()): Promise<string> {
		const key = stockTransactionIdKey(type, date)
		const counter = await this.sequences
			.findOneAndUpdate({ _id: key }, { $inc: { sequence: 1 } }, { upsert: true, new: true })
			.lean()
			.exec()

		if (!counter) throw new Error(`Failed to allocate stock transaction ID for ${key}`)
		return formatStockTransactionId(key, counter.sequence)
	}
}
