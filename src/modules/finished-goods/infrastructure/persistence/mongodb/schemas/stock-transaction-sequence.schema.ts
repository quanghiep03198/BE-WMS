import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import type { Model } from 'mongoose'

export const STOCK_TRANSACTION_SEQUENCE_COLLECTION = 'stock_transaction_sequences'

@Schema({ collection: STOCK_TRANSACTION_SEQUENCE_COLLECTION, versionKey: false, writeConcern: { w: 'majority' } })
export class StockTransactionSequence {
	@Prop({ type: String, required: true })
	_id: string

	@Prop({ type: Number, required: true })
	sequence: number
}

export const StockTransactionSequenceSchema = SchemaFactory.createForClass(StockTransactionSequence)
export type StockTransactionSequenceModel = Model<StockTransactionSequence>
