import { VALID_EPC_PATTERN } from '@common/constants/regex'
import { FinishedGoodsEpcStatus } from '@modules/finished-goods/domain/constants'
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import mongoose, { HydratedDocument, PaginateModel } from 'mongoose'
import MongooseDeletePlugin, { SoftDeleteModel } from 'mongoose-delete'
import MongoosePaginatePlugin from 'mongoose-paginate-v2'

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

	@Prop({
		type: String,
		required: true,
		length: 24,
		immutable: true,
		validate: (value) => VALID_EPC_PATTERN.test(value)
	})
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

	@Prop({ type: Date, default: null })
	recalled_at: Date | null

	@Prop({ type: Date, default: null })
	returned_at: Date | null

	@Prop({ type: Boolean, default: false })
	deleted: boolean

	@Prop({ type: Number, default: 0 })
	inbound_times: number

	@Prop({ type: String, enum: Object.values(FinishedGoodsEpcStatus), default: FinishedGoodsEpcStatus.SCANNING })
	status: FinishedGoodsEpcStatus
}

export const FinishedGoodsEpcSchema = SchemaFactory.createForClass(FinishedGoodsEpc)

// FinishedGoodsEpcSchema.index({ outbound_at: 1 }, { expires: '60d', name: 'idx_outbound_at' })
// * Indexes
FinishedGoodsEpcSchema.index({ epc: 1 }, { unique: true, name: 'idx_epc' })
FinishedGoodsEpcSchema.index(
	{ scannable: 1, deleted: 1, status: 1, inbound_device_sn: 1, storage_location: 1 },
	{ name: 'idx_inbound_active' }
)
FinishedGoodsEpcSchema.index(
	{ scannable: 1, deleted: 1, status: 1, outbound_device_sn: 1, storage_location: 1 },
	{
		name: 'idx_outbound_active'
	}
)
FinishedGoodsEpcSchema.index(
	{ scannable: 1, deleted: 1, mo_no: 1, factory_shoes_style: 1, size_numcode: 1 },
	{ name: 'idx_group_mo_style_size' }
)
FinishedGoodsEpcSchema.index(
	{ scannable: 1, deleted: 1, mo_no: 1, factory_shoes_style: 1, color_sn: 1, size_numcode: 1 },
	{ name: 'idx_specs_inbound', partialFilterExpression: { inbound_at: null } }
)
FinishedGoodsEpcSchema.index(
	{ scannable: 1, deleted: 1, mo_no: 1, factory_shoes_style: 1, color_sn: 1, size_numcode: 1 },
	{
		name: 'idx_specs_outbound',
		partialFilterExpression: {
			inbound_at: { $gt: new Date(2024, 0, 1) },
			outbound_at: null
		}
	}
)

// * Addon plugins
FinishedGoodsEpcSchema.plugin(MongoosePaginatePlugin)

FinishedGoodsEpcSchema.plugin(MongooseDeletePlugin, {
	overrideMethods: true
})

export type FinishedGoodsEpcDocument = HydratedDocument<FinishedGoodsEpc> & { record_time: string }
export type FinishedGoodsEpcModel = PaginateModel<FinishedGoodsEpcDocument> & SoftDeleteModel<FinishedGoodsEpcDocument>
