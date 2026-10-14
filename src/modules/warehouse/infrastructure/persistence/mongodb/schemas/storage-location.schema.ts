import { BaseAbstractSchema } from '@modules/_base/base.abstract.schema'
import { User } from '@modules/user/infrastructure/persistence/mongodb/schemas/user.schema'
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import type { HydratedDocument, PaginateModel } from 'mongoose'
import { Types } from 'mongoose'
import MongooseAutoPopulate from 'mongoose-autopopulate'
import MongooseDelete, { type SoftDeleteModel } from 'mongoose-delete'
import MongooseLeanVirtuals from 'mongoose-lean-virtuals'
import MongoosePaginate from 'mongoose-paginate-v2'
import { WarehouseDocument } from './warehouse.schema'

export const STORAGE_LOCATION_COLLECTION = 'storage_locations'

@Schema({
	collection: STORAGE_LOCATION_COLLECTION,
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
export class StorageLocation extends BaseAbstractSchema {
	@Prop({ type: String, required: true, trim: true, uppercase: true })
	name: string

	@Prop({ type: Types.ObjectId, required: true, ref: 'Warehouse', autopopulate: { select: '_id name' } })
	warehouse: Types.ObjectId | Pick<WarehouseDocument, '_id' | 'name'>

	@Prop({
		type: Types.ObjectId,
		required: true,
		ref: 'User',
		autopopulate: { select: '_id username display_name roles' }
	})
	created_by: User | Types.ObjectId

	@Prop({ type: Types.ObjectId, ref: 'User', autopopulate: { select: '_id username display_name roles' } })
	updated_by: User | Types.ObjectId
}

export const StorageLocationSchema = SchemaFactory.createForClass(StorageLocation)

StorageLocationSchema.index({ warehouse: 1, name: 1 }, { unique: true })

// * Addon plugins
StorageLocationSchema.plugin(MongoosePaginate)
StorageLocationSchema.plugin(MongooseDelete, { overrideMethods: true })
StorageLocationSchema.plugin(MongooseAutoPopulate)
StorageLocationSchema.plugin(MongooseLeanVirtuals)

StorageLocationSchema.loadClass(StorageLocation)

export type StorageLocationDocument = HydratedDocument<StorageLocation, { created_at: Date; updated_at?: Date }>

export type StorageLocationModel = PaginateModel<StorageLocationDocument> & SoftDeleteModel<StorageLocationDocument>
