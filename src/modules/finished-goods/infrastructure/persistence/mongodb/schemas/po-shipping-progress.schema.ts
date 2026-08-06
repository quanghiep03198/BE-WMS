import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import type { HydratedDocument, Model } from 'mongoose'

export const PO_SHIPPING_PROGRESS_COLLECTION = 'po_shipping_progress'

@Schema({
	collection: PO_SHIPPING_PROGRESS_COLLECTION,
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
export class PoShippingProgress {
	@Prop({ type: String, required: true })
	po: string

	@Prop({ type: Number, required: true })
	order_qty: number

	@Prop({ type: String, required: true })
	factory_shoes_style: string

	@Prop({ type: String, required: true })
	cust_shoes_style: string

	@Prop({ type: String, required: true })
	color_sn: string

	@Prop({ type: String, requried: true })
	destination: string

	@Prop({ type: String, required: true })
	shipping_method: string

	@Prop({ type: Object, defautl: {} })
	shipping_progress: Record<
		string,
		{
			order_qty: number
			shipped_out_qty: number
		}
	>
}

export const PoShippingProgressSchema = SchemaFactory.createForClass(PoShippingProgress)

PoShippingProgressSchema.index({ po: 1 }, { unique: true, name: 'po_idx' })

PoShippingProgressSchema.virtual('outbound_history', {
	ref: 'DailyPoShippingProgress',
	localField: 'po',
	foreignField: 'po'
})

PoShippingProgressSchema.set('toObject', { virtuals: true })
PoShippingProgressSchema.set('toJSON', { virtuals: true })

export type PoShippingProgressDocument = HydratedDocument<PoShippingProgress> & {
	outbound_history: Array<{
		date: string
		shipping_progress: Record<string, Record<string, number>>
	}>
}

export type PoShippingProgressModel = Model<PoShippingProgressDocument>
