import { SuperJson } from '@/common/utils'
import { DATA_SOURCE_ERP } from '@/databases/constants'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable, OnModuleInit } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { Cache } from 'cache-manager'
import { PinoLogger } from 'nestjs-pino'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { deflateSync, inflateSync } from 'node:zlib'
import { DataSource } from 'typeorm'
import { ProductSpecification } from './types'

@Injectable()
export class ProductSpecificationService implements OnModuleInit {
	private readonly productSpecificationQuery: string = readFileSync(
		resolve(join(__dirname, './sql/product-specification.sql')),
		'utf-8'
	)
	private readonly CACHE_TTL: number = 60 * 1000 * 60 * 12 // 12 hours
	private readonly CACHE_KEY: string = '/api/product-specification'

	constructor(
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
		@InjectDataSource(DATA_SOURCE_ERP) private readonly dataSourceERP: DataSource,
		private readonly logger: PinoLogger
	) {}

	async onModuleInit() {
		try {
			const cachedProductSpecification = await this.cacheManager.get(this.CACHE_KEY)
			if (!cachedProductSpecification) {
				const data = await this.getProductSpecification()
				await this.cacheManager.set(
					this.CACHE_KEY,
					deflateSync(JSON.stringify(data)).toString('base64'),
					this.CACHE_TTL
				) // * Cache for 12 hour
			}
		} catch (error) {
			this.logger.error(error)
		}
	}

	public async getProductSpecification() {
		const cachedProductSpecification = await this.cacheManager.get<string>(this.CACHE_KEY)
		if (cachedProductSpecification) {
			return JSON.parse(inflateSync(Buffer.from(cachedProductSpecification, 'base64')).toString())
		} else {
			const start = performance.now()
			console.log('\n\nStart query at :>>>', start, '\n\n')
			await this.dataSourceERP.query(/* SQL */ `SET NOCOUNT ON`)
			await this.dataSourceERP.query(/* SQL */ `SET TEXTSIZE 2147483647`)
			await this.dataSourceERP.query(/* SQL */ `SET STATISTICS XML OFF`)
			const data = await this.dataSourceERP
				.query<Array<{
					brand_name: string
					product_variants: string
				}> | null>(this.productSpecificationQuery)
				.then((data) => {
					return data.map((item) => ({
						...item,
						...(SuperJson.isValid(item.product_variants)
							? {
									product_variants: SuperJson.parse<ProductSpecification['product_variants']>(
										item.product_variants
									)
								}
							: { product_variants: [] })
					}))
				})

			const end = performance.now()
			console.log('\n\nFinish query with :>>>', end - start, '\n\n')

			await this.cacheManager.set(
				this.CACHE_KEY,
				deflateSync(JSON.stringify(data)).toString('base64'),
				this.CACHE_TTL
			) // * Cache for 12 hour
			return data
		}
	}
}
