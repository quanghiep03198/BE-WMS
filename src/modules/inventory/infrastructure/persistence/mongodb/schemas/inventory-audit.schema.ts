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
	inventory_closure_status: 'completed' | 'pending'

	@Prop({ type: Array, required: true, default: [] })
	storage_locations: Array<string>

	@Prop({ type: Object, required: true, default: {} })
	size_ledger: Record<
		string,
		{
			order_qty: number
			beginning_inventory_qty: number
			stocked_in_qty: number
			shipped_out_qty: number
			supplemental_stocked_in_qty: number
			supplemental_shipped_out_qty: number
		}
	>
}

export const MoInventoryAuditSchema = SchemaFactory.createForClass(MoInventoryAudit)

MoInventoryAuditSchema.index({ mo_no: 1, year_month: 1 }, { unique: true })

MoInventoryAuditSchema.virtual('mo_attrs', {
	ref: 'ManufacturingOrder',
	localField: 'mo_no',
	foreignField: 'mo_no',
	justOne: true
})

MoInventoryAuditSchema.virtual('daily_mo_inv_attrs', {
	ref: 'DailyMoInventoryLedger',
	localField: 'mo_no',
	foreignField: 'mo_no'
})

MoInventoryAuditSchema.set('toJSON', { virtuals: true })

MoInventoryAuditSchema.set('toObject', { virtuals: true })

export type MoInventoryAuditDocument = HydratedDocument<MoInventoryAudit> & {
	mo_attrs: {
		mo_no: string
		order_qty: number
		brand_name: string
		cust_shoes_style: string
		factory_shoes_style: string
		color_sn: string
		size_ledger: Record<
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
}

export type MoInventoryAuditModel = Model<MoInventoryAuditDocument>
