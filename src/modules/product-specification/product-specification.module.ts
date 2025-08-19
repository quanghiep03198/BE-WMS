import { Module } from '@nestjs/common'
import { ProductSpecificationController } from './product-specification.controller'
import { ProductSpecificationService } from './product-specification.service'

@Module({
	providers: [ProductSpecificationService],
	controllers: [ProductSpecificationController]
})
export class ProductSpecificationModule {}
