import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import mongoose, { HydratedDocument, PaginateModel } from 'mongoose'
import { SoftDeleteModel } from 'mongoose-delete'

export const FINISHED_GOODS_EPCS_COLLECTION = 'finished_goods_epcs'

@Schema({
	collection: FINISHED_GOODS_EPCS_COLLECTION,
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
export class FinishedGoodsEpc {
	@Prop({ type: mongoose.Schema.Types.ObjectId })
	_id: mongoose.Types.ObjectId

	@Prop({ type: String, required: true, length: 24, immutable: true })
	epc: string

	@Prop({ type: Boolean, required: true, default: true })
	scannable: boolean

	@Prop({ type: String, required: true })
	mo_no: string

	@Prop({ type: String })
	po: string

	@Prop({ type: String, required: true })
	factory_code_produce: string

	@Prop({ type: String, required: true })
	color_sn: string

	@Prop({ type: String, required: true })
	factory_shoes_style: string

	@Prop({ type: String, required: true })
	size_numcode: string

	@Prop({ type: Date })
	last_scanned_at: Date

	@Prop({ type: String, required: true })
	inbound_device_sn: string

	@Prop({ type: String })
	assembly_line: string

	@Prop({ type: String })
	storage_location: string

	@Prop({ type: Date, default: null })
	inbound_at: Date | null

	@Prop({ type: String, default: null })
	outbound_device_sn: string | null

	@Prop({ type: Date, default: null })
	outbound_at: Date | null

	@Prop({ type: String, default: null, enum: ['recall', 'shipping'] })
	outbound_type: boolean

	@Prop({ type: Boolean, default: false })
	deleted: boolean
}

export const FinishedGoodsEpcSchema = SchemaFactory.createForClass(FinishedGoodsEpc)
export type FinishedGoodsEpcDocument = HydratedDocument<FinishedGoodsEpc> & { record_time: string }
export type FinishedGoodsEpcModel = PaginateModel<FinishedGoodsEpcDocument> & SoftDeleteModel<FinishedGoodsEpcDocument>
