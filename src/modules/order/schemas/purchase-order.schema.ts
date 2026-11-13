import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import type { HydratedDocument, Model } from 'mongoose'
import { orderSearchPlugin } from '../order-search-grams'
import { ShippingMethod } from '../types'

@Schema()
class PurchaseOrderShippingProgress {
	@Prop({ type: Number, required: true })
	order_qty: number

	@Prop({ type: Number, required: true })
	shipped_out_qty: number
}

const PurchaseOrderShippingProgressSchema = SchemaFactory.createForClass(PurchaseOrderShippingProgress)

export const PURCHASE_ORDER_COLLECTION = 'purchase_orders'

@Schema({
	collection: PURCHASE_ORDER_COLLECTION,
	timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
	versionKey: false,
	suppressReservedKeysWarning: false,
	strict: false,
	strictQuery: false,
	readConcern: { level: 'majority' },
	writeConcern: { w: 'majority' }
})
export class PurchaseOrder {
	@Prop({ type: String, required: true })
	po: string

	@Prop({ type: [String], select: false })
	search_ngrams: string[]

	@Prop({ type: Number, required: true })
	order_qty: number

	@Prop({ type: String, required: true })
	brand_name: string

	@Prop({ type: String, required: true })
	cust_shoes_style: string

	@Prop({ type: String, required: true })
	factory_shoes_style: string

	@Prop({ type: String, required: true })
	color_sn: string

	@Prop({ type: Object, required: true })
	packing: Record<string, Record<string, number>>

	@Prop({ type: String, default: null })
	shipping_destination: string | null

	@Prop({ type: String, default: null })
	shipping_method: ShippingMethod | null

	@Prop({ type: Map, of: PurchaseOrderShippingProgressSchema, default: {} })
	shipping_progress: Map<string, PurchaseOrderShippingProgress>
}

export const PurchaseOrderSchema = SchemaFactory.createForClass(PurchaseOrder)

PurchaseOrderSchema.index({ po: 1 }, { unique: true, name: 'po_idx' })
PurchaseOrderSchema.index({ search_ngrams: 1, po: 1 }, { name: 'po_search_ngrams_idx' })
PurchaseOrderSchema.plugin(orderSearchPlugin, { field: 'po' })

PurchaseOrderSchema.virtual('outbound_history', {
	ref: 'DailyPoShippingProgress',
	localField: 'po',
	foreignField: 'po'
})

PurchaseOrderSchema.set('toObject', { virtuals: true })
PurchaseOrderSchema.set('toJSON', { virtuals: true })

export type PurchaseOrderDocument = HydratedDocument<PurchaseOrder> & {
	outbound_history: Array<{
		date: string
		shipping_progress: Record<string, Record<string, number>>
		transaction_history: Map<
			string,
			{
				time: string
				packing: Record<string, Record<string, number>>
				voided: boolean
			}
		>
	}>
}

export type PurchaseOrderModel = Model<PurchaseOrderDocument>
