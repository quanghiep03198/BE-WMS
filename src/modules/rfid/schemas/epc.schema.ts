import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import mongoose, { HydratedDocument, PaginateModel } from 'mongoose'
import { SoftDeleteModel } from 'mongoose-delete'

export const EPC_INBOUND_COLLECTION = 'epcs'
export const EPC_OUTBOUND_COLLECTION = 'epcs_outbound'

@Schema({
	collection: EPC_INBOUND_COLLECTION,
	timestamps: {
		createdAt: 'record_time',
		updatedAt: 'modified_at'
	},
	versionKey: false,
	suppressReservedKeysWarning: false,
	strict: false,
	strictQuery: false
})
export class EpcInbound {
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
	scannable: boolean
}

@Schema({
	collection: EPC_OUTBOUND_COLLECTION,
	timestamps: {
		createdAt: 'record_time',
		updatedAt: 'modified_at'
	},
	versionKey: false,
	suppressReservedKeysWarning: false,
	strict: false,
	strictQuery: false
})
export class EpcOutbound extends EpcInbound {}

export type EpcInboundDocument = HydratedDocument<EpcInbound> & { record_time: string }
export type EpcOutboundDocument = HydratedDocument<EpcOutbound> & { record_time: string }
export type EpcInboundModel = PaginateModel<EpcInboundDocument> & SoftDeleteModel<EpcInboundDocument>
export type EpcOutboundModel = PaginateModel<EpcOutboundDocument> & SoftDeleteModel<EpcInboundDocument>

export const EpcInboundSchema = SchemaFactory.createForClass(EpcInbound)
export const EpcOutboundSchema = SchemaFactory.createForClass(EpcOutbound)
