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
		const data = await this.dataSourceERP
			.query<Array<ProductSpecification> | null>(this.productVariantsQuery)
			.then((data) => {
				return data.map((item) => ({
					...item,
					...(SuperJson.isValid(item.product_variants)
						? {
								product_variants: SuperJson.parse<ProductSpecification>(item.product_variants)
							}
						: { product_variants: [] })
				}))
			})

		const customerBrands = new Map<string, Map<string, ProductVariant[]>>()

		for (const item of data) {
			const { brand_name, shoes_style } = item
			const pv = Array.isArray(item.product_variants) ? (item.product_variants as ProductVariant[]) : []

			let shoeStyles = customerBrands.get(brand_name)
			if (!shoeStyles) {
				shoeStyles = new Map<string, ProductVariant[]>()
				customerBrands.set(brand_name, shoeStyles)
			}

			let variants = shoeStyles.get(shoes_style)
			if (!variants) {
				variants = []
				shoeStyles.set(shoes_style, variants)
			}

			if (pv.length) variants.push(...pv)
		}

		const aggregatedData = Array.from(customerBrands.entries()).map(([brand_name, products_variants]) => ({
			brand_name,
			product_variants: Array.from(products_variants.entries()).map(([shoes_style, specs]) => ({
				shoes_style,
				specs
			}))
		}))

		return aggregatedData
	}
}
