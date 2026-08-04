import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import type { HydratedDocument, Model } from 'mongoose'

export const DAILY_PO_SHIPPING_PROGRESS_COLLECTION = 'daily_po_shipping_progress'

@Schema({
	collection: DAILY_PO_SHIPPING_PROGRESS_COLLECTION,
	timestamps: {
		createdAt: 'created_at',
		updatedAt: 'updated_at'
	},
	versionKey: false,
	suppressReservedKeysWarning: false,
	strict: false,
	strictQuery: false,
	readConcern: { level: 'majority' },
	writeConcern: { w: 'majority' }
})
export class DailyPoShippingProgress {
	@Prop({
		type: String,
		required: true,
		validate: (value) => /^\d{4}-\d{2}-\d{2}$/.test(value),
		message: 'Invalid date format. Expected format: yyyy-MM-dd'
	})
	date: string

	@Prop({ type: String, required: true })
	po: string

	@Prop({ type: Object, defautl: {} })
	shipping_progress: Record<
		string,
		{
			order_qty: number
			shipped_out_qty: number
		}
	>
}

export const DailyPoShippingProgressSchema = SchemaFactory.createForClass(DailyPoShippingProgress)

DailyPoShippingProgressSchema.index({ date: 1, po: 1 }, { unique: true, name: 'idx_date_po' })

export type DailyPoShippingProgressDocument = HydratedDocument<DailyPoShippingProgress>

export type DailyPoShippingProgressModel = Model<DailyPoShippingProgressDocument>
