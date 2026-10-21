import { BaseAbstractSchema } from '@modules/_base/base.abstract.schema'
import { User } from '@modules/user/infrastructure/persistence/mongodb/schemas/user.schema'
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, PaginateModel, Types } from 'mongoose'
import MongooseAutoPopulate from 'mongoose-autopopulate'
import MongooseDelete, { SoftDeleteModel } from 'mongoose-delete'
import MongooseLeanVirtuals from 'mongoose-lean-virtuals'
import MongoosePaginate from 'mongoose-paginate-v2'

import { StorageLocation } from './storage-location.schema'

export const WAREHOUSE_COLLECTION = 'warehouses'

@Schema({
	collection: WAREHOUSE_COLLECTION,
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
export class Warehouse extends BaseAbstractSchema {
	@Prop({ type: String, required: true, trim: true, uppercase: true })
	code: string

	@Prop({ type: String, required: true, trim: true, uppercase: true })
	name: string

	@Prop({ type: Number, required: true })
	capacity: number

	@Prop({
		type: Types.ObjectId,
		required: true,
		ref: 'User',
		autopopulate: { select: '_id username display_name roles created_at' }
	})
	created_by: User | Types.ObjectId

	@Prop({ type: Types.ObjectId, ref: 'User', autopopulate: { select: '_id username display_name roles created_at' } })
	updated_by: User | Types.ObjectId
}

export const WarehouseSchema = SchemaFactory.createForClass(Warehouse)

WarehouseSchema.index({ name: 1 }, { unique: true })

WarehouseSchema.virtual('storage_locations', {
	ref: 'StorageLocation',
	localField: '_id',
	foreignField: 'warehouse',
	justOne: false
})

// * Addon plugins
WarehouseSchema.plugin(MongoosePaginate)
WarehouseSchema.plugin(MongooseDelete, { overrideMethods: true })
WarehouseSchema.plugin(MongooseAutoPopulate)
WarehouseSchema.plugin(MongooseLeanVirtuals)

WarehouseSchema.loadClass(Warehouse)

export type WarehouseDocument = HydratedDocument<
	Warehouse,
	{ created_at: Date; updated_at?: Date; storage_locations?: Array<StorageLocation> }
>

export type WarehouseModel = PaginateModel<WarehouseDocument> & SoftDeleteModel<WarehouseDocument>
