import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, Model } from 'mongoose'

export const MO_INVENTORY_AUDIT_COLLECTION_NAME = 'mo_inventory_audit'

@Schema({
	collection: MO_INVENTORY_AUDIT_COLLECTION_NAME,
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
export class MoInventoryAudit {
	@Prop({ type: String, required: true })
	mo_no: string

	@Prop({ type: String, required: true })
	year_month: string

	@Prop({ type: String, required: true })
	factory_code_produce: string

	@Prop({ type: String, required: true })
	factory_shoes_style: string

	@Prop({ type: String, required: true })
	cust_shoes_style: string

	@Prop({ type: String, required: true })
	color_sn: string

	@Prop({ type: Array, required: true, default: [] })
	storage_locations: Array<string>

	@Prop({ type: Number, required: true })
	total_storages: number

	@Prop({ type: Number, required: true })
	total_storage_capacity: number

	@Prop({ type: Object, required: true, default: {} })
	inventory_varation: Record<
		string,
		{
			target_qty: number
			initial_stock_qty: number
			stocked_in_qty: number
			shipped_out_qty: number
			total_recall_tx: number
			total_return_tx: number
			supplemental_instock_qty: number
			supplemental_outstock_qty: number
		}
	>
}

export const MoInventoryAuditSchema = SchemaFactory.createForClass(MoInventoryAudit)

MoInventoryAuditSchema.index({ mo_no: 1, year_month: 1 }, { unique: true })

export type MoInventoryAuditDocument = HydratedDocument<MoInventoryAudit>

export type MoInventoryAuditModel = Model<MoInventoryAuditDocument>
