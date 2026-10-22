import type { StorageLocationDocument } from '@modules/warehouse/infrastructure/persistence/mongodb/schemas/storage-location.schema'
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, LeanDocument, Model, Types } from 'mongoose'
import MongooseAutoPopulate from 'mongoose-autopopulate'

export const MO_INVENTORY_AUDIT_COLLECTION_NAME = 'mo_inventory_audit'

@Schema({ _id: false })
class InventoryAuditSizeLedger {
	@Prop({ type: Number, required: true })
	order_qty: number

	@Prop({ type: Number, required: true })
	beginning_inventory_qty: number

	@Prop({ type: Number, required: true })
	stocked_in_qty: number

	@Prop({ type: Number, required: true })
	shipped_out_qty: number

	@Prop({ type: Number, required: true })
	supplemental_stocked_in_qty: number

	@Prop({ type: Number, required: true })
	supplemental_shipped_out_qty: number

	get final_inventory_qty() {
		return (
			this.beginning_inventory_qty +
			this.stocked_in_qty +
			this.supplemental_stocked_in_qty -
			this.shipped_out_qty -
			this.supplemental_shipped_out_qty
		)
	}
}

const InventoryAuditSizeLedgerSchema = SchemaFactory.createForClass(InventoryAuditSizeLedger)

InventoryAuditSizeLedgerSchema.loadClass(InventoryAuditSizeLedger)

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

	@Prop({
		type: [{ type: Types.ObjectId, ref: 'StorageLocation', autopopulate: true }],
		default: []
	})
	storage_locations: Array<Types.ObjectId | LeanDocument<StorageLocationDocument>>

	@Prop({ type: Map, of: InventoryAuditSizeLedgerSchema, required: true })
	size_ledger: Map<string, InventoryAuditSizeLedger>
}

export const MoInventoryAuditSchema = SchemaFactory.createForClass(MoInventoryAudit)

MoInventoryAuditSchema.index({ year_month: 1, mo_no: 1 }, { unique: true })

MoInventoryAuditSchema.virtual('mo_specification', {
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

MoInventoryAuditSchema.plugin(MongooseAutoPopulate)

export type MoInventoryAuditDocument = HydratedDocument<MoInventoryAudit> & {
	storage_locations: Array<any>
	mo_specification: {
		mo_no: string
		order_qty: number
		brand_name: string
		cust_shoes_style: string
		factory_shoes_style: string
		color_sn: string
		size_ledger: Map<
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
