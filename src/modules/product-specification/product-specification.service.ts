import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { ProductSpecification, ProductSpecificationModel } from './schemas/product-specification.schema'

@Injectable()
export class ProductSpecificationService {
	constructor(
		@InjectModel(ProductSpecification.name, DATA_WAREHOUSE_CONNECTION)
		private readonly productSpecsModel: ProductSpecificationModel
	) {}

	public async getProductSpecification() {
		return await this.productSpecsModel.find().lean()
	}
}
