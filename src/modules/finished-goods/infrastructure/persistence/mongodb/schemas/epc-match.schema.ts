import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, Model } from 'mongoose'

export const FINISHED_GOODS_EPCS_MATCH_COLLECTION = 'finished_goods_epcs_match'

@Schema({
	collection: FINISHED_GOODS_EPCS_MATCH_COLLECTION,
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
export class FinishedGoodsEpcMatch {
	@Prop({ type: String, required: true })
	epc: string

	@Prop({ type: String, required: true })
	mo_no: string

	@Prop({ type: String, required: true })
	factory_shoes_style: string

	@Prop({ type: String, required: true })
	cust_shoes_style: string

	@Prop({ type: String, required: true })
	color_sn: string

	@Prop({ type: String, required: true })
	size_numcode: string

	@Prop({ type: String, required: true })
	factory_code_produce: string
}

export const FinishedGoodsEpcMatchSchema = SchemaFactory.createForClass(FinishedGoodsEpcMatch)

FinishedGoodsEpcMatchSchema.index({ epc: 1 }, { name: 'idx_epc', unique: true })

export type FinishedGoodsEpcMatchDocument = HydratedDocument<FinishedGoodsEpcMatch>

export type FinishedGoodsEpcMatchModel = Model<FinishedGoodsEpcMatchDocument>
