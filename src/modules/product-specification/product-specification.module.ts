import { Module } from '@nestjs/common'
import { ProductSpecificationController } from './product-specification.controller'
import { ProductSpecificationService } from './product-specification.service'
import { MongooseModule } from '@nestjs/mongoose'
import { PRODUCT_SPECIFICATION_COLLECTION, ProductSpecification, ProductSpecificationSchema } from './schemas/product-specification.schema'

@Module({
	imports: [
		MongooseModule.forFeatureAsync([
			{
				name: ProductSpecification.name,
				collection: PRODUCT_SPECIFICATION_COLLECTION,
				useFactory: () => {
					ProductSpecificationSchema.index({ brand_name: 1, factory_shoes_style: 1, cust_shoes_style: 1 }, { unique: true })
					return ProductSpecificationSchema
				}
			}
		])
	],
	providers: [ProductSpecificationService],
	controllers: [ProductSpecificationController],
	exports: [ProductSpecificationService, MongooseModule]
})
export class ProductSpecificationModule {}
