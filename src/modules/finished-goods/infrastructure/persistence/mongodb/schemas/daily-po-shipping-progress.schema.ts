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

	@Prop({ type: Object, default: {} })
	shipping_progress: Record<string, Record<string, number>>
}

export const DailyPoShippingProgressSchema = SchemaFactory.createForClass(DailyPoShippingProgress)

DailyPoShippingProgressSchema.index({ date: 1, po: 1 }, { unique: true, name: 'idx_date_po' })

DailyPoShippingProgressSchema.virtual('po_attrs', {
	ref: 'PurchaseOrder',
	localField: 'po',
	foreignField: 'po',
	justOne: true
})

DailyPoShippingProgressSchema.set('toObject', { virtuals: true })
DailyPoShippingProgressSchema.set('toJSON', { virtuals: true })

export type DailyPoShippingProgressDocument = HydratedDocument<DailyPoShippingProgress> & {
	po_attrs: {
		factory_shoes_style: string
		cust_shoes_style: string
		color_sn: string
		order_qty: number
		shipping_type: string
		shipping_destination: string
		shipping_progress: Record<
			`0${number}` | `${number}`,
			{
				order_qty: number
				shipped_out_qty: number
			}
		>
	}
}

export type DailyPoShippingProgressModel = Model<DailyPoShippingProgressDocument>
