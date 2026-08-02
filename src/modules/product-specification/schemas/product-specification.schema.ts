import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import mongoose, { HydratedDocument, Model } from 'mongoose'
import { ProductVariant } from '../types'

export const PRODUCT_SPECIFICATION_COLLECTION = 'product_specifications'

@Schema({
	versionKey: false,
	suppressReservedKeysWarning: false,
	strict: false,
	strictQuery: false,
	readConcern: { level: 'majority' },
	writeConcern: { w: 'majority' }
})
export class ProductSpecification {
	@Prop({ type: mongoose.Schema.Types.ObjectId })
	_id: mongoose.Types.ObjectId

	@Prop({ type: String, required: true })
	brand_name: string

	@Prop({ type: String, required: true })
	cust_shoes_style: string

	@Prop({ type: String, required: true })
	factory_shoes_style: string

	@Prop({ type: Array<ProductVariant>, required: true })
	product_variants: Array<ProductVariant>
}

export type ProductSpecificationDocument = HydratedDocument<ProductSpecification>

export const ProductSpecificationSchema = SchemaFactory.createForClass(ProductSpecification)

ProductSpecificationSchema.index({ brand_name: 1, factory_shoes_style: 1, cust_shoes_style: 1 }, { unique: true })

export type ProductSpecificationModel = Model<ProductSpecificationDocument>
