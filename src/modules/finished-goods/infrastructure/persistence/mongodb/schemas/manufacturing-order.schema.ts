import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, Model } from 'mongoose'

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

	@Prop({ type: Object, requried: true })
	inventory_variation: Record<
		string,
		{
			order_qty: number
			stocked_in_qty: number
			total_recall_tx: number
			total_return_tx: number
			shipped_out_qty: number
		}
	>
}

export const ManufacturingOrderSchema = SchemaFactory.createForClass(ManufacturingOrder)

ManufacturingOrderSchema.index({ mo_no: 1 }, { name: 'idx_mo', unique: true })

ManufacturingOrderSchema.virtual('daily_inbound_history', {
	ref: 'DailyMoInventoryVariation',
	localField: 'mo_no',
	foreignField: 'mo_no'
})

ManufacturingOrderSchema.set('toObject', { virtuals: true })
ManufacturingOrderSchema.set('toJSON', { virtuals: true })

export type ManufacturingOrderDocument = HydratedDocument<ManufacturingOrder> & { record_time: string }
export type ManufacturingOrderModel = Model<ManufacturingOrderDocument>
