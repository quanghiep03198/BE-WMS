import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, Model } from 'mongoose'

export const DAILY_MO_INVENTORY_VARIATION_COLLECTION = 'daily_mo_inventory_variation'

@Schema({
	collection: DAILY_MO_INVENTORY_VARIATION_COLLECTION,
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
export class DailyMoInventoryVariation {
	@Prop({ type: String, required: true })
	date: string

	@Prop({ type: String, required: true })
	mo_no: string

	@Prop({ type: Array, default: [] })
	assembly_lines: Array<string>

	@Prop({ type: Array, default: [] })
	storage_locations: Array<string>

	@Prop({ type: Object, required: true })
	inventory_variation: Record<
		string,
		{
			stocked_in_qty: number
			total_recall_tx: number
			total_return_tx: number
			shipped_out_qty: number
		}
	>
}

export const DailyMoInventoryVariationSchema = SchemaFactory.createForClass(DailyMoInventoryVariation)

DailyMoInventoryVariationSchema.index({ date: 1, mo_no: 1 }, { name: 'idx_date_mo', unique: true })

DailyMoInventoryVariationSchema.virtual('mo_attrs', {
	ref: 'MoInventoryVariation',
	localField: 'mo_no',
	foreignField: 'mo_no',
	justOne: true
})

DailyMoInventoryVariationSchema.set('toObject', { virtuals: true })
DailyMoInventoryVariationSchema.set('toJSON', { virtuals: true })

export type DailyMoInventoryVariationDocument = HydratedDocument<DailyMoInventoryVariation> & {
	record_time: string
	mo_attrs: {
		factory_shoes_style: string
		color_sn: string
		factory_code_produce: string
		mo_total_qty: number
		inventory_variation: Record<
			string,
			{
				target_qty: number
				stocked_in_qty: number
				total_recall_tx: number
				total_return_tx: number
				shipped_out_qty: number
			}
		>
	}
}
export type DailyMoInventoryVariationModel = Model<DailyMoInventoryVariationDocument>
