import { Prop, Schema, SchemaFactory, SchemaOptions } from '@nestjs/mongoose'
import mongoose, { HydratedDocument, PaginateModel } from 'mongoose'
import { SoftDeleteModel } from 'mongoose-delete'

export const EPC_INBOUND_COLLECTION = 'epcs_inbound'
export const EPC_OUTBOUND_COLLECTION = 'epcs_outbound'

/**
 * @description Default schema options for the EPC schemas.
 * @type {SchemaOptions}
 */
const defaultSchemaOptions: SchemaOptions = {
	timestamps: {
		createdAt: 'record_time',
		updatedAt: 'modified_at'
	},
	versionKey: false,
	suppressReservedKeysWarning: false,
	strict: false,
	strictQuery: false,
	readConcern: { level: 'majority' },
	writeConcern: { w: 'majority' }
}

/**
 * @description Class representing the base abstract EPC schema.
 */
@Schema(defaultSchemaOptions)
abstract class BaseAbstractEpcSchema {
	@Prop({ type: mongoose.Schema.Types.ObjectId })
	_id: mongoose.Types.ObjectId

	@Prop({ type: String, required: true, unique: true, length: 24 })
	epc: string

	@Prop({ type: Boolean, required: true, default: true, index: true })
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
	shoes_style_code_factory: string

	@Prop({ type: String, required: true })
	size_numcode: string

	@Prop({ type: String, required: true, index: true })
	station_no: string

	@Prop({ type: Date })
	stored_at: Date
}

/**
 * @description Class representing the inbound EPC schema.
 */
@Schema({
	collection: EPC_INBOUND_COLLECTION,
	...defaultSchemaOptions
})
export class EpcInbound extends BaseAbstractEpcSchema {}

/**
 * @description Class representing the outbound EPC schema.
 */
@Schema({
	collection: EPC_OUTBOUND_COLLECTION,
	...defaultSchemaOptions
})
export class EpcOutbound extends BaseAbstractEpcSchema {}

export const EpcInboundSchema = SchemaFactory.createForClass(EpcInbound)
export const EpcOutboundSchema = SchemaFactory.createForClass(EpcOutbound)

export type EpcDocument = HydratedDocument<EpcInbound | EpcOutbound> & { record_time: string }
export type EpcModel = PaginateModel<EpcDocument> & SoftDeleteModel<EpcDocument>
export type EpcSchema = typeof EpcInboundSchema | typeof EpcOutboundSchema
