import { DATA_SOURCE_ERP } from '@/databases/constants'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable, OnModuleInit } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { Cache } from 'cache-manager'
import { PinoLogger } from 'nestjs-pino'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DataSource } from 'typeorm'

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
				await this.cacheManager.set(this.CACHE_KEY, data, this.CACHE_TTL) // * Cache for 12 hour
			}
		} catch (error) {
			this.logger.error(error)
		}
	}

	public async getProductSpecification() {
		const cachedProductSpecification = await this.cacheManager.get<string>(this.CACHE_KEY)
		if (cachedProductSpecification) {
			return JSON.parse(cachedProductSpecification)
		} else {
			const data = await this.dataSourceERP
				.query<Array<{
					brand_name: string
					product_variants: string
				}> | null>(this.productSpecificationQuery)
				.then((data) => {
					if (Array.isArray(data))
						return data.map((item) => ({ ...item, product_variants: JSON.parse(item.product_variants) }))
					else return []
				})
			await this.cacheManager.set(this.CACHE_KEY, data, this.CACHE_TTL) // * Cache for 12 hour
			return data
		}
	}
}
