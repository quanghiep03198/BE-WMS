import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import mongoose, { HydratedDocument, PaginateModel } from 'mongoose'
import { SoftDeleteModel } from 'mongoose-delete'

export const EPC_COLLECTION = 'epcs'

@Schema({
	collection: EPC_COLLECTION,
	timestamps: {
		createdAt: 'record_time',
		updatedAt: 'modified_at'
	},
	versionKey: false,
	suppressReservedKeysWarning: false,
	strict: false,
	strictQuery: false
})
export class Epc {
	@Prop({ type: mongoose.Schema.Types.ObjectId })
	_id: mongoose.Types.ObjectId

	@Prop({ type: String, required: true, unique: true })
	epc: string

	@Prop({ type: String, required: true, index: true })
	mo_no: string

	@Prop({ type: String, required: true })
	mat_ecolor: string

	@Prop({ type: String, required: true })
	shoes_style_code_factory: string

	@Prop({ type: String, required: true })
	size_numcode: string

	@Prop({ type: String, required: true })
	station_no: string

	@Prop({ type: Boolean, required: true, default: true, index: true })
	scannable: string
}

export type EpcDocument = HydratedDocument<Epc> & { record_time: string }

export type EpcModel = PaginateModel<EpcDocument> & SoftDeleteModel<EpcDocument>

export const EpcSchema = SchemaFactory.createForClass(Epc)
