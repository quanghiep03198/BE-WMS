import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, Model } from 'mongoose'
import mongooseLeanVirtuals from 'mongoose-lean-virtuals'

export const DAILY_MO_INVENTORY_LEDGER_COLLECTION = 'daily_mo_inventory_ledger'

@Schema({
	collection: DAILY_MO_INVENTORY_LEDGER_COLLECTION,
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
export class DailyMoInventoryLedger {
	@Prop({ type: String, required: true })
	date: string

	@Prop({ type: String, required: true })
	mo_no: string

	@Prop({ type: Array, default: [] })
	assembly_lines: Array<string>

	@Prop({ type: Array, default: [] })
	storage_locations: Array<string>

	@Prop({ type: Object, required: true })
	size_ledger: Record<
		string,
		{
			stocked_in_qty: number
			total_recall_tx: number
			total_return_tx: number
		}
	>
}

export const DailyMoInventoryLedgerSchema = SchemaFactory.createForClass(DailyMoInventoryLedger)

DailyMoInventoryLedgerSchema.index({ date: 1, mo_no: 1 }, { name: 'idx_date_mo', unique: true })

DailyMoInventoryLedgerSchema.plugin(mongooseLeanVirtuals)

DailyMoInventoryLedgerSchema.virtual('mo_attrs', {
	ref: 'ManufacturingOrder',
	localField: 'mo_no',
	foreignField: 'mo_no',
	justOne: true
})

DailyMoInventoryLedgerSchema.set('toObject', { virtuals: true })
DailyMoInventoryLedgerSchema.set('toJSON', { virtuals: true })

export type DailyMoInventoryLedgerDocument = HydratedDocument<DailyMoInventoryLedger> & {
	mo_attrs: {
		factory_shoes_style: string
		color_sn: string
		factory_code_produce: string
		order_qty: number
		brand_name: string
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

export type DailyMoInventoryLedgerModel = Model<DailyMoInventoryLedgerDocument>
