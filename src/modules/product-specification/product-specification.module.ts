import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { ProductSpecificationController } from './product-specification.controller'
import { ProductSpecificationService } from './product-specification.service'
import {
	PRODUCT_SPECIFICATION_COLLECTION,
	ProductSpecification,
	ProductSpecificationSchema
} from './schemas/product-specification.schema'

@Module({
	imports: [
		MongooseModule.forFeature(
			[
				{
					name: ProductSpecification.name,
					collection: PRODUCT_SPECIFICATION_COLLECTION,
					schema: ProductSpecificationSchema
				}
			],
			DATA_WAREHOUSE_CONNECTION
		)
	],
	providers: [ProductSpecificationService],
	controllers: [ProductSpecificationController],
	exports: [ProductSpecificationService, MongooseModule]
})
export class ProductSpecificationModule {}
