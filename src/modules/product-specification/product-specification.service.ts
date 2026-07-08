import { DATA_WAREHOUSE_CONNECTION } from '@/databases/constants'
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { ProductSpecification, ProductSpecificationModel } from './schemas/product-specification.schema'
import { ProductVariant } from './types'

@Injectable()
export class ProductSpecificationService {
	constructor(
		@InjectModel(ProductSpecification.name, DATA_WAREHOUSE_CONNECTION)
		private readonly productSpecsModel: ProductSpecificationModel
	) {}

	public async getProductSpecification() {
		const data = await this.productSpecsModel.find().lean()

		const brandMap = new Map<string, Map<string, { cust_shoes_style: string; variants: ProductVariant[] }>>()

		for (const { brand_name, factory_shoes_style, cust_shoes_style, product_variants } of data) {
			if (!brandMap.has(brand_name)) {
				brandMap.set(brand_name, new Map())
			}

			const productMap = brandMap.get(brand_name)!
			if (!productMap.has(factory_shoes_style)) {
				productMap.set(factory_shoes_style, { cust_shoes_style, variants: [] })
			}

			if (Array.isArray(product_variants) && product_variants.length > 0) {
				productMap.get(factory_shoes_style)!.variants.push(...product_variants)
			}
		}

		return Array.from(brandMap, ([brand_name, products]) => ({
			brand_name,
			product_variants: Array.from(products, ([factory_shoes_style, { cust_shoes_style, variants }]) => ({
				factory_shoes_style,
				cust_shoes_style,
				specs: variants
			}))
		}))
	}
}
