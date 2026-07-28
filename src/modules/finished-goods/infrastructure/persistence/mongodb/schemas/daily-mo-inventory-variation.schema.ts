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

	@Prop({ type: Object, required: true })
	inventory_variation: Record<string, { stocked_in_qty: number; shipped_out_qty: number }>
}

export const DailyMoInventoryVariationSchema = SchemaFactory.createForClass(DailyMoInventoryVariation)
export type DailyMoInventoryVariationDocument = HydratedDocument<DailyMoInventoryVariation> & { record_time: string }
export type DailyMoInventoryVariationModel = Model<DailyMoInventoryVariationDocument>

// const DailyInboundReport = [
// 	{
// 		report_date: '2026-07-22',
// 		mo_no: '15A07C038',
// 		inventory_variation: {
// 			'05': {
// 				stocked_in_qty: 15,
// 				recalled_qty: 0,
// 				returned_qty: 0,
// 				shipped_out_qty: 0
// 			},
// 			'06': {
// 				stocked_in_qty: 5,
// 				recalled_qty: 0,
// 				returned_qty: 0,
// 				shipped_out_qty: 0
// 			},
// 			'07': {
// 				stocked_in_qty: 79,
// 				recalled_qty: 0,
// 				returned_qty: 0,
// 				shipped_out_qty: 1
// 			},
// 			'08': {
// 				stocked_in_qty: 109,
// 				recalled_qty: 0,
// 				returned_qty: 0,
// 				shipped_out_qty: 0
// 			}
// 		}

// 		// ... 90+ more records
// 	}
// ]
