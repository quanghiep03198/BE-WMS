import { env } from '@common/utils'
import { PurchaseOrder } from '@modules/order/schemas/purchase-order.schema'
import { UserDocument } from '@modules/user/infrastructure/persistence/mongodb/schemas/user.schema'
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, PaginateModel, Types } from 'mongoose'
import MongooseAutoPopulate from 'mongoose-autopopulate'
import MongooseDelete, { SoftDeleteModel } from 'mongoose-delete'
import MongooseLeanVirtuals from 'mongoose-lean-virtuals'
import MongoosePaginate from 'mongoose-paginate-v2'
import { TruckloadDeliveryStatus } from '../../../../domain/constants'

export const TRUCKLOAD_DELIVERY_COLLECTION = 'truckload_delivery'

@Schema()
class TruckloadPacking {
	@Prop({ type: String, required: true })
	po: string

	@Prop({ type: Number, required: true })
	outbound_qty: number

	@Prop({ type: Types.ObjectId, ref: 'User', autopopulate: { select: '_id username display_name' } })
	created_by: Types.ObjectId | Pick<UserDocument, '_id' | 'username' | 'display_name'>

	@Prop({ type: Types.ObjectId, ref: 'User', autopopulate: { select: '_id username display_name' } })
	updated_by?: Types.ObjectId | Pick<UserDocument, '_id' | 'username' | 'display_name'>

	@Prop({ type: Date, default: null })
	created_at: Date | null

	@Prop({ type: Date, default: null })
	updated_at: Date | null

	po_info?: PurchaseOrder
}

type TruckloadPackingDocument = HydratedDocument<TruckloadPacking>

const TruckloadPackingSchema = SchemaFactory.createForClass(TruckloadPacking)

TruckloadPackingSchema.loadClass(TruckloadPacking)

TruckloadPackingSchema.virtual('po_info', {
	ref: 'PurchaseOrder',
	localField: 'po',
	foreignField: 'po',
	justOne: true,
	autopopulate: { select: '-packing -shipping_progress' }
})

TruckloadPackingSchema.set('toObject', { virtuals: true })
TruckloadPackingSchema.set('toJSON', { virtuals: true })
TruckloadPackingSchema.plugin(MongooseAutoPopulate)

@Schema({
	collection: TRUCKLOAD_DELIVERY_COLLECTION,
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
export class TruckloadDelivery {
	@Prop({ type: String, required: true })
	dispatch_order: string

	@Prop({
		type: [TruckloadPackingSchema],
		default: []
	})
	packing: Array<TruckloadPackingDocument>

	/** Denormalized `sum(packing.outbound_qty)` so it can be sorted without an aggregation. */
	@Prop({ type: Number, default: 0 })
	total_outbound_qty: number

	@Prop({ type: String, default: env<FactoryCode>('APP_TENANCY') })
	factory_code: FactoryCode

	@Prop({ type: String })
	license_plate: string

	@Prop({ type: String })
	container_number?: string

	@Prop({ type: String })
	seal_number?: string

	@Prop({ type: Boolean, default: false })
	punctured_container: boolean

	@Prop({ type: Boolean, default: false })
	smelling_container: boolean

	@Prop({ type: Boolean, default: false })
	moist_container: boolean

	@Prop({ type: Date })
	factory_entrance_time?: Date

	@Prop({ type: Date })
	container_sealing_time: Date

	@Prop({ type: Date })
	factory_departure_time: Date

	@Prop({ type: Date })
	license_plate_capture_time?: Date

	@Prop({ type: String })
	license_plate_image?: string

	@Prop({ type: String, enum: TruckloadDeliveryStatus, default: TruckloadDeliveryStatus.PENDING })
	approval_status: TruckloadDeliveryStatus

	/** GridFS file ids (bucket `dispatch_order_signatures`) */
	@Prop({ type: Types.ObjectId, default: null })
	ie_signature: Types.ObjectId | null

	@Prop({ type: Types.ObjectId, default: null })
	warehouse_officer_signature: Types.ObjectId | null

	@Prop({ type: Types.ObjectId, default: null })
	security_1_signature: Types.ObjectId | null

	@Prop({ type: Types.ObjectId, default: null })
	security_2_signature: Types.ObjectId | null

	@Prop({ type: String })
	remark?: string

	@Prop({ type: Types.ObjectId, ref: 'User', autopopulate: { select: 'username display_name' } })
	created_by?: Types.ObjectId

	@Prop({ type: Types.ObjectId, ref: 'User', autopopulate: { select: 'username display_name' } })
	updated_by?: Types.ObjectId

	/** Optimistic lock counter, incremented on every write (application and CDC). */
	@Prop({ type: Number, default: 0 })
	revision: number

	created_at: Date

	updated_at?: Date | null
}

export const TruckloadDeliverySchema = SchemaFactory.createForClass(TruckloadDelivery)

// * Business key shared with MSSQL. Also serves the anchored-prefix scan that allocates the next daily sequence.
TruckloadDeliverySchema.index({ dispatch_order: 1 }, { unique: true, name: 'idx_dispatch_order' })
// * Default list order (created_at desc, container_sealing_time desc) and the created_at range filter
TruckloadDeliverySchema.index(
	{ created_at: -1, container_sealing_time: -1, dispatch_order: -1 },
	{ name: 'idx_created_at_container_sealing_time' }
)
// * Filter by approval status, newest first
TruckloadDeliverySchema.index({ approval_status: 1, created_at: -1 }, { name: 'idx_approval_status_created_at' })
// * PO filter (multikey) and dispatched quantity aggregation per PO
TruckloadDeliverySchema.index({ 'packing.po': 1 }, { name: 'idx_packing_po' })
// * License plate search/sort and camera capture matching (plate equality + sealing time range)
TruckloadDeliverySchema.index(
	{ license_plate: 1, container_sealing_time: 1 },
	{ name: 'idx_license_plate_container_sealing_time' }
)
TruckloadDeliverySchema.index({ container_number: 1 }, { name: 'idx_container_number' })
TruckloadDeliverySchema.index({ seal_number: 1 }, { name: 'idx_seal_number' })
// * Date range filter / sort columns
TruckloadDeliverySchema.index({ container_sealing_time: -1 }, { name: 'idx_container_sealing_time' })
TruckloadDeliverySchema.index({ factory_departure_time: -1 }, { name: 'idx_factory_departure_time' })
TruckloadDeliverySchema.index(
	{ factory_entrance_time: -1 },
	{ name: 'idx_factory_entrance_time', partialFilterExpression: { factory_entrance_time: { $type: 'date' } } }
)
TruckloadDeliverySchema.index(
	{ license_plate_capture_time: -1 },
	{
		name: 'idx_license_plate_capture_time',
		partialFilterExpression: { license_plate_capture_time: { $type: 'date' } }
	}
)

TruckloadDeliverySchema.plugin(MongooseDelete, { overrideMethods: 'all' })
TruckloadDeliverySchema.plugin(MongoosePaginate)
TruckloadDeliverySchema.plugin(MongooseAutoPopulate)
TruckloadDeliverySchema.plugin(MongooseLeanVirtuals)

export type TruckloadDeliveryDocument = HydratedDocument<TruckloadDelivery>

export type TruckloadDeliveryModel = SoftDeleteModel<TruckloadDeliveryDocument> &
	PaginateModel<TruckloadDeliveryDocument>
