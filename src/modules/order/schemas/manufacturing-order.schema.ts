import { DailyMoInventoryLedgerDocument } from '@modules/finished-goods/infrastructure/persistence/mongodb/schemas/daily-mo-inventory-ledger.schema'
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, LeanDocument, Model } from 'mongoose'
import MongooseLeanVirtuals from 'mongoose-lean-virtuals'
import { orderSearchPlugin } from './order-search-grams.plugin'

@Schema({ _id: false })
class ManufacturingOrderSizeLedger {
	@Prop({ type: Number, required: true })
	order_qty: number

	@Prop({ type: Number, required: true })
	stocked_in_qty: number

	@Prop({ type: Number, required: true })
	total_recall_tx: number

	@Prop({ type: Number, required: true })
	total_return_tx: number

	@Prop({ type: Number, required: true })
	shipped_out_qty: number

	instock_qty: number

	missing_qty: number
}

const ManufacturingOrderSizeLedgerSchema = SchemaFactory.createForClass(ManufacturingOrderSizeLedger)

ManufacturingOrderSizeLedgerSchema.virtual('instock_qty').get(function () {
	return this.stocked_in_qty - this.total_recall_tx + this.total_return_tx - this.shipped_out_qty
})

ManufacturingOrderSizeLedgerSchema.virtual('missing_qty').get(function () {
	return this.order_qty - (this.stocked_in_qty - this.total_recall_tx + this.total_return_tx - this.shipped_out_qty)
})

ManufacturingOrderSizeLedgerSchema.set('toObject', { virtuals: true })
ManufacturingOrderSizeLedgerSchema.set('toJSON', { virtuals: true })

export const MANUFACTURING_ORDERS_COLLECTION = 'manufacturing_orders'

@Schema({
	collection: MANUFACTURING_ORDERS_COLLECTION,
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
export class ManufacturingOrder {
	@Prop({ type: String, requried: true })
	mo_no: string

	@Prop({ type: [String], select: false })
	search_ngrams: string[]

	@Prop({ type: String, requried: true })
	brand_name: string

	@Prop({ type: String, requried: true })
	factory_code_produce: string

	@Prop({ type: String, requried: true })
	factory_shoes_style: string

	@Prop({ type: String, requried: true })
	cust_shoes_style: string

	@Prop({ type: String, requried: true })
	color_sn: string

	@Prop({ type: Number, requried: true })
	order_qty: number

	@Prop({
		type: Map,
		of: ManufacturingOrderSizeLedgerSchema,
		requried: true
	})
	size_ledger: Map<string, ManufacturingOrderSizeLedger>
}

export const ManufacturingOrderSchema = SchemaFactory.createForClass(ManufacturingOrder)

ManufacturingOrderSchema.plugin(MongooseLeanVirtuals)
ManufacturingOrderSchema.plugin(orderSearchPlugin, { field: 'mo_no' })

ManufacturingOrderSchema.index({ mo_no: 1 }, { name: 'idx_mo', unique: true })
ManufacturingOrderSchema.index({ search_ngrams: 1, mo_no: -1 }, { name: 'mo_search_ngrams_idx' })

ManufacturingOrderSchema.virtual('daily_inbound_history', {
	ref: 'DailyMoInventoryLedger',
	localField: 'mo_no',
	foreignField: 'mo_no'
})

ManufacturingOrderSchema.set('toObject', { virtuals: true })
ManufacturingOrderSchema.set('toJSON', { virtuals: true })

export type ManufacturingOrderDocument = HydratedDocument<ManufacturingOrder> & {
	daily_inbound_history: Array<LeanDocument<DailyMoInventoryLedgerDocument>>
}
export type ManufacturingOrderModel = Model<ManufacturingOrderDocument>
