import { SuperJson } from '@/common/utils'
import { DATA_SOURCE_ERP } from '@/databases/constants'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable, OnModuleInit } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { Cache } from 'cache-manager'
import { PinoLogger } from 'nestjs-pino'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { DataSource } from 'typeorm'
import { ProductSpecification, ProductVariant } from './types'

@Injectable()
export class ProductSpecificationService implements OnModuleInit {
	private readonly productVariantsQuery: string = readFileSync(
		resolve(join(__dirname, './sql/product-variants.sql')),
		'utf-8'
	)
	private readonly CACHE_TTL: number = 60 * 1000 * 60 * 12 // 12 hours
	private readonly CACHE_KEY: string = 'cached:product_specification'

	constructor(
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
		@InjectDataSource(DATA_SOURCE_ERP) private readonly dataSourceERP: DataSource,
		private readonly logger: PinoLogger
	) {}

	async onModuleInit() {
		try {
			const cachedProductSpecification = await this.cacheManager.get<string>(this.CACHE_KEY)
			if (!cachedProductSpecification) return await this.getProductSpecification()

			return gunzipSync(Buffer.from(cachedProductSpecification, 'base64'))
		} catch (error) {
			this.logger.error(error)
		}
	}

	public async getProductSpecification() {
		const cachedProductSpecification = await this.cacheManager.get<string>(this.CACHE_KEY)
		if (cachedProductSpecification) {
			return JSON.parse(gunzipSync(Buffer.from(cachedProductSpecification, 'base64')).toString('utf-8'))
		} else {
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

			await this.cacheManager.set(
				this.CACHE_KEY,
				gzipSync(JSON.stringify(aggregatedData)).toString('base64'),
				this.CACHE_TTL
			)

			return aggregatedData
		}
	}
}
