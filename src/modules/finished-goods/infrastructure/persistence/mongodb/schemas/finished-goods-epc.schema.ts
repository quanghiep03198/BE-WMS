import { Prop, Schema, SchemaFactory, SchemaOptions } from '@nestjs/mongoose'
import mongoose, { HydratedDocument, PaginateModel } from 'mongoose'
import { SoftDeleteModel } from 'mongoose-delete'

export const EPC_INBOUND_COLLECTION = 'epcs_inbound'
export const EPC_OUTBOUND_COLLECTION = 'epcs_outbound'
export const FINISHED_GOODS_EPCS = 'finished_goods_epcs'

/**
 * @description Default schema options for the EPC schemas.
 * @type {SchemaOptions}
 */
const DEFAULT_SCHEMA_OPTIONS: SchemaOptions = {
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
@Schema(DEFAULT_SCHEMA_OPTIONS)
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
	factory_shoes_style: string

	@Prop({ type: String, required: true })
	size_numcode: string

	@Prop({ type: String, required: true, index: true })
	station_no: string

	@Prop({ type: String, required: true, index: true })
	device_sn: string

	@Prop({ type: Date })
	stored_at: Date
}

/**
 * @description Class representing the inbound EPC schema.
 */
@Schema({
	collection: EPC_INBOUND_COLLECTION,
	...DEFAULT_SCHEMA_OPTIONS
})
export class EpcInbound extends BaseAbstractEpcSchema {}

/**
 * @description Class representing the outbound EPC schema.
 */
@Schema({
	collection: EPC_OUTBOUND_COLLECTION,
	...DEFAULT_SCHEMA_OPTIONS
})
export class EpcOutbound extends BaseAbstractEpcSchema {}

@Schema({
	collection: FINISHED_GOODS_EPCS,
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

	@Prop({ type: String, required: true, uppercase: true })
	mo_no: string

	@Prop({ type: String })
	po: string

	@Prop({ type: String, required: true, uppercase: true })
	factory_code_produce: string

	@Prop({ type: String, required: true, uppercase: true })
	color_sn: string

	@Prop({ type: String, required: true })
	factory_shoes_style: string

	@Prop({ type: String, required: true })
	size_numcode: string

	@Prop({ type: Date })
	last_scanned_at: Date

	@Prop({ type: String, required: true })
	inbound_device_sn: string

	@Prop({ type: Date, default: null })
	inbound_at: Date | null

	@Prop({ type: String, default: null })
	outbound_device_sn: string | null

	@Prop({ type: Date, default: null })
	outbound_at: Date | null

	@Prop({ type: Boolean, default: false })
	is_recalled: boolean

	@Prop({ type: Boolean, default: false })
	deleted: boolean
}

export const EpcInboundSchema = SchemaFactory.createForClass(EpcInbound)
export const EpcOutboundSchema = SchemaFactory.createForClass(EpcOutbound)

export type EpcDocument = HydratedDocument<EpcInbound | EpcOutbound> & { record_time: string }
export type EpcModel = PaginateModel<EpcDocument> & SoftDeleteModel<EpcDocument>
export type EpcSchema = typeof EpcInboundSchema | typeof EpcOutboundSchema

export const FinishedGoodsEpcSchema = SchemaFactory.createForClass(FinishedGoodsEpc)
export type FinishedGoodsEpcDocument = HydratedDocument<FinishedGoodsEpc> & { record_time: string }
export type FinishedGoodsEpcModel = PaginateModel<FinishedGoodsEpcDocument> & SoftDeleteModel<FinishedGoodsEpcDocument>
