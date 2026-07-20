import { Prop, Schema } from '@nestjs/mongoose'

@Schema({
	collection: 'purchase_orders',
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
	po: string

	@Prop({ type: String, required: true })
	brand_name: string

	@Prop({ type: String, required: true })
	factory_shoes_style: string

	@Prop({ type: String, required: true })
	color_sn: string

	@Prop({ type: Array, required: true })
	packing_list: Array<{
		mo_no: string
		sizes: Array<{ size_numcode: string; size_qty: number }>
	}>
}
