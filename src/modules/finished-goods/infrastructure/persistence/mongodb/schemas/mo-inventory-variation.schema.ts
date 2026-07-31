import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, Model } from 'mongoose'

export const MO_INVENTORY_VARIATION_COLLECTION = 'mo_inventory_variation'

@Schema({
	collection: MO_INVENTORY_VARIATION_COLLECTION,
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
export class MoInventoryVariation {
	@Prop({ type: String, requried: true })
	mo_no: string

	@Prop({ type: String, requried: true })
	factory_code_produce: string

	@Prop({ type: String, requried: true })
	factory_shoes_style: string

	@Prop({ type: String, requried: true })
	color_sn: string

	@Prop({ type: Number, requried: true })
	mo_total_qty: number

	@Prop({ type: Object, requried: true })
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

export const MoInventoryVariationSchema = SchemaFactory.createForClass(MoInventoryVariation)

MoInventoryVariationSchema.index({ mo_no: 1 }, { name: 'idx_mo', unique: true })

MoInventoryVariationSchema.virtual('daily_inbound_history', {
	ref: 'DailyMoInventoryVariation',
	localField: 'mo_no',
	foreignField: 'mo_no'
})

MoInventoryVariationSchema.set('toObject', { virtuals: true })
MoInventoryVariationSchema.set('toJSON', { virtuals: true })

export type MoInventoryVariationDocument = HydratedDocument<MoInventoryVariation> & { record_time: string }
export type MoInventoryVariationModel = Model<MoInventoryVariationDocument>

/**
 * @example
[
	{
		mo_no: '15A07B054',
		factory_code_produce: 'VA1',
		factory_shoes_style: 'UF26-W2920-4',
		color_sn: 'KHA',
		total_target_qty: 35,
		mo_progress: {
			'04': { target_qty: 2, inbound_qty: 2, outbound_qty: 0, inventory: 2 },
			'05': { target_qty: 5, inbound_qty: 5, outbound_qty: 0, inventory: 5 },
			'06': { target_qty: 7, inbound_qty: 7, outbound_qty: 0, inventory: 7 },
			'07': { target_qty: 8, inbound_qty: 8, outbound_qty: 0, inventory: 8 },
			'08': { target_qty: 6, inbound_qty: 6, outbound_qty: 0, inventory: 6 },
			'09': { target_qty: 3, inbound_qty: 3, outbound_qty: 0, inventory: 3 },
			'10': { target_qty: 3, inbound_qty: 3, outbound_qty: 0, inventory: 3 },
			'11': { target_qty: 1, inbound_qty: 1, outbound_qty: 0, inventory: 1 }
		}
	}
]
*/
