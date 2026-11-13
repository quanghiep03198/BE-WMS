import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { IStockTransactionIdGenerator } from '@modules/finished-goods/application/ports/stock-transaction-id-generator.port'
import {
	formatStockTransactionId,
	stockTransactionIdKey,
	StockTransactionType
} from '@modules/finished-goods/domain/value-objects/stock-transaction-id'
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { StockTransactionSequence, StockTransactionSequenceModel } from '../schemas/stock-transaction-sequence.schema'

@Injectable()
export class StockTransactionIdMongoGenerator implements IStockTransactionIdGenerator {
	constructor(
		@InjectModel(StockTransactionSequence.name, DATA_WAREHOUSE_CONNECTION)
		private readonly sequences: StockTransactionSequenceModel
	) {}

	async nextId(type: StockTransactionType): Promise<string> {
		const key = stockTransactionIdKey(type, new Date())
		const counter = await this.sequences
			.findOneAndUpdate({ _id: key }, { $inc: { sequence: 1 } }, { upsert: true, new: true })
			.lean()
			.exec()

		if (!counter) throw new Error(`Failed to allocate stock transaction ID for ${key}`)
		return formatStockTransactionId(key, counter.sequence)
	}
}
