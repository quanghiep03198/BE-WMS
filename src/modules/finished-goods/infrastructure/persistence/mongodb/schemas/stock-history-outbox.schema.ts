import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'

export type StockHistoryDirection = 'inbound' | 'outbound'

@Schema({ collection: 'stock_history_outbox' })
export class StockHistoryOutbox {
	@Prop({ type: String, required: true })
	_id: string

	@Prop({ type: String, required: true, enum: ['inbound', 'outbound'] })
	direction: StockHistoryDirection

	@Prop({ type: String, required: true })
	transactionId: string

	@Prop({ type: String, required: true })
	revision: string

	@Prop({ type: String })
	payload?: string

	@Prop({ type: Boolean, required: true })
	voided: boolean

	@Prop({ type: Date, required: true })
	nextAttemptAt: Date

	@Prop({ type: Date, required: true })
	expiresAt: Date
}

export const StockHistoryOutboxSchema = SchemaFactory.createForClass(StockHistoryOutbox)
StockHistoryOutboxSchema.index({ nextAttemptAt: 1, _id: 1 })
StockHistoryOutboxSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
