import {
	DefectiveCategory,
	DefectiveGoodsOutboundPurpose,
	DefectiveGoodsSource,
	DefectiveLocation
} from '@modules/defective-goods/domain/constants'
import { Department } from '@modules/department/schemas/department.schema'
import { User } from '@modules/user/infrastructure/persistence/mongodb/schemas/user.schema'
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { type HydratedDocument, type ObjectId, type PaginateModel, Types } from 'mongoose'
import MongooseAutoPopulate from 'mongoose-autopopulate'
import MongooseDelete, { SoftDeleteModel } from 'mongoose-delete'
import MongooseLeanVirtuals from 'mongoose-lean-virtuals'
import MongoosePaginate from 'mongoose-paginate-v2'

const DEFECTIVE_GOODS_COLLECTION: Readonly<string> = 'defective_goods'

@Schema({
	collection: DEFECTIVE_GOODS_COLLECTION,
	id: true,
	versionKey: false,
	timestamps: {
		createdAt: 'created_at',
		updatedAt: 'updated_at'
	},
	strictQuery: false,
	toJSON: { virtuals: true },
	toObject: { virtuals: true }
})
export class DefectiveGoods {
	@Prop({ type: String, trim: true, length: 24 })
	epc: string

	@Prop({ type: String, trim: true, uppercase: true, default: null })
	brand_name: Nullish<string>

	@Prop({ type: String, trim: true, uppercase: true, default: null })
	mo_no: Nullish<string>

	@Prop({ type: String, trim: true, uppercase: true, default: null })
	po: Nullish<string>

	@Prop({ type: String, trim: true, uppercase: true, required: true })
	factory_shoes_style: string

	@Prop({ type: String, trim: true, required: true })
	cust_shoes_style: string

	@Prop({ type: String, required: true })
	color_sn: string

	@Prop({ type: String, required: true, trim: true })
	size_numcode: string

	@Prop({ type: String, enum: DefectiveCategory, required: true })
	defective_category: DefectiveCategory

	@Prop({ type: String, required: true })
	defective_description: string

	/**
	 * Tương ứng với cột shoe_source trong mssql
	 */
	@Prop({ type: String, default: DefectiveGoodsSource.FINAL_INSPECTION })
	shoe_source: DefectiveGoodsSource

	@Prop({ type: Types.ObjectId, ref: () => Department.name, autopopulate: true })
	assembly_line: ObjectId

	@Prop({ type: Types.ObjectId, ref: () => Department.name, autopopulate: true })
	sewing_line: ObjectId

	/**
	 * Tương đương với ri_type trong MSSQL
	 */
	@Prop({ type: String, enum: ['uhf', 'usb', 'manually'], required: true })
	combination_strategy: 'uhf' | 'usb' | 'manually'

	@Prop({ type: String, enum: DefectiveLocation, required: true })
	defective_location: DefectiveLocation

	@Prop({ type: String, enum: ['prs', 'pcs'], required: true })
	unit: 'prs' | 'pcs'

	@Prop({ type: String, trim: true, uppercase: true })
	storage_location: string

	@Prop({ type: Date })
	inbound_date?: Date

	@Prop({ type: String, enum: DefectiveGoodsOutboundPurpose })
	outbound_purpose: DefectiveGoodsOutboundPurpose

	@Prop({ type: Date })
	outbound_date?: Date

	@Prop({ type: Date, default: null })
	deleted_at?: Date | null

	@Prop({ type: Types.ObjectId, ref: () => User.name, autopopulate: true })
	created_by: Types.ObjectId

	@Prop({ type: Types.ObjectId, ref: () => User.name, autopopulate: true })
	updated_by?: Types.ObjectId
}

export const DefectiveGoodsSchema = SchemaFactory.createForClass(DefectiveGoods)

DefectiveGoodsSchema.index({ deleted_at: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 })
DefectiveGoodsSchema.index({ defective_category: 1 })

DefectiveGoodsSchema.plugin(MongoosePaginate)
DefectiveGoodsSchema.plugin(MongooseAutoPopulate)
DefectiveGoodsSchema.plugin(MongooseLeanVirtuals)
DefectiveGoodsSchema.plugin(MongooseDelete, { overrideMethods: 'all', deletedAt: false })

export type DefectiveGoodsDocument = HydratedDocument<DefectiveGoods>

export type DefectiveGoodsModel = SoftDeleteModel<DefectiveGoodsDocument> & PaginateModel<DefectiveGoodsDocument>
