import { SuperJson } from '@/common/utils'
import { DATA_SOURCE_ERP } from '@/databases/constants'
import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DataSource } from 'typeorm'
import { ProductSpecification, ProductVariant } from './types'

@Injectable()
export class ProductSpecificationService {
	private readonly productVariantsQuery: string = readFileSync(
		resolve(join(__dirname, './sql/product-variants.sql')),
		'utf-8'
	)

	constructor(@InjectDataSource(DATA_SOURCE_ERP) private readonly dataSourceERP: DataSource) {}

	public async getProductSpecification() {
		const rawData = await this.dataSourceERP.query<ProductSpecification[]>(this.productVariantsQuery)

		const processedData = rawData.map((item) => ({
			...item,
			product_variants: SuperJson.isValid(item.product_variants)
				? SuperJson.parse<ProductVariant[]>(item.product_variants, 1)
				: []
		}))

		const brandMap = new Map<string, Map<string, { cust_shoes_style: string; variants: ProductVariant[] }>>()

		for (const { brand_name, factory_shoes_style, cust_shoes_style, product_variants } of processedData) {
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
