import {
	CombinationStrategy,
	DefectiveCategory,
	DefectiveGoodsOutboundPurpose,
	DefectiveGoodsSource,
	DefectiveGoodsUnit,
	DefectiveLocation
} from '@modules/defective-goods/domain/constants'
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Types, type HydratedDocument, type PaginateModel } from 'mongoose'
import MongooseAutoPopulate from 'mongoose-autopopulate'
import MongooseDelete, { SoftDeleteModel } from 'mongoose-delete'
import MongooseLeanVirtuals from 'mongoose-lean-virtuals'
import MongoosePaginate from 'mongoose-paginate-v2'

const DEFECTIVE_GOODS_COLLECTION: Readonly<string> = 'defective_goods'

@Schema({
	collection: DEFECTIVE_GOODS_COLLECTION,
	timestamps: {
		createdAt: 'created_at',
		updatedAt: 'updated_at'
	},
	versionKey: false,
	suppressReservedKeysWarning: false,
	strictQuery: false,
	readConcern: { level: 'majority' },
	writeConcern: { w: 'majority' },
	toJSON: { virtuals: true },
	toObject: { virtuals: true }
})
export class DefectiveGoods {
	@Prop({ type: String, required: true, length: 24, immutable: true })
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

	@Prop({ type: Types.ObjectId, ref: 'Department', autopopulate: true })
	assembly_line: Types.ObjectId

	@Prop({ type: Types.ObjectId, ref: 'Department', autopopulate: true })
	sewing_line: Types.ObjectId

	/**
	 * Tương đương với ri_type trong MSSQL
	 */
	@Prop({ type: String, enum: CombinationStrategy, required: true })
	combination_strategy: CombinationStrategy

	@Prop({ type: String, enum: DefectiveLocation, required: true })
	defective_location: DefectiveLocation

	@Prop({ type: String, enum: DefectiveGoodsUnit, required: true })
	unit: DefectiveGoodsUnit

	@Prop({ type: String, trim: true, uppercase: true })
	storage_location: string

	@Prop({ type: Date })
	inbound_date?: Date

	@Prop({ type: String, enum: DefectiveGoodsOutboundPurpose })
	outbound_purpose?: DefectiveGoodsOutboundPurpose

	@Prop({ type: Date })
	outbound_date?: Date

	@Prop({ type: Date, default: null })
	deleted_at?: Date | null

	@Prop({ type: Types.ObjectId, ref: 'User', autopopulate: true })
	created_by: Types.ObjectId

	@Prop({ type: Types.ObjectId, ref: 'User', autopopulate: true })
	updated_by?: Types.ObjectId
}

export const DefectiveGoodsSchema = SchemaFactory.createForClass(DefectiveGoods)

DefectiveGoodsSchema.index({ outbound_at: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 })
DefectiveGoodsSchema.index({ defective_category: 1 })

DefectiveGoodsSchema.plugin(MongoosePaginate)
DefectiveGoodsSchema.plugin(MongooseDelete, { overrideMethods: true })
DefectiveGoodsSchema.plugin(MongooseAutoPopulate)
DefectiveGoodsSchema.plugin(MongooseLeanVirtuals)

DefectiveGoodsSchema.loadClass(DefectiveGoods)

for (const op of ['deleteOne', 'deleteMany', 'findOneAndDelete'] as const) {
	DefectiveGoodsSchema.pre(op, function () {
		throw new Error(`Hard delete via ${op} is not allowed, use delete()/deleteById()`)
	})
}

export type DefectiveGoodsDocument = HydratedDocument<DefectiveGoods>

export type DefectiveGoodsModel = SoftDeleteModel<DefectiveGoodsDocument> & PaginateModel<DefectiveGoodsDocument>
