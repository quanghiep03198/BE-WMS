import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, Model } from 'mongoose'

export const MANUFACTURING_ORDER_COLLECTION = 'manufacturing_orders'

@Schema({
	collection: MANUFACTURING_ORDER_COLLECTION,
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
	@Prop({ type: String, required: true })
	mo_no: string

	@Prop({ type: Number, required: true })
	mo_total_qty: number

	@Prop({ type: String, required: true })
	brand_name: string

	@Prop({ type: String, required: true })
	factory_shoes_style: string

	@Prop({ type: String, required: true })
	color_sn: string

	@Prop({ type: String, required: true })
	factory_code_produce: string

	@Prop({
		type: Object,
		required: true,
		default: {}
	})
	sizes: { [key: string]: number }
}

export const ManufacturingOrderSchema = SchemaFactory.createForClass(ManufacturingOrder)
export type ManufacturingOrderDocument = HydratedDocument<ManufacturingOrder>
export type ManufacturingOrderModel = Model<ManufacturingOrderDocument>
