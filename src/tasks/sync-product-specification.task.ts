import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Cron, CronExpression } from '@nestjs/schedule'
import { AnyBulkWriteOperation, Model } from 'mongoose'
import { ProductSpecificationService } from '@/modules/product-specification/product-specification.service'
import { ProductSpecification, ProductSpecificationDocument } from '@/modules/product-specification/schemas/product-specification.schema'
import { ProductVariant } from '@/modules/product-specification/types'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { DATA_SOURCE_ERP } from '@/databases/constants'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { SuperJson } from '@/common/utils'

type ProductVariantPayload = {
	factory_shoes_style: string
	cust_shoes_style: string
	specs: ProductVariant[]
}

type ProductSpecificationPayload = {
	brand_name: string
	product_variants: ProductVariantPayload[]
}

@Injectable()
export class SyncProductSpecificationTask {
	private readonly logger = new Logger(SyncProductSpecificationTask.name)

      private readonly productVariantsQuery: string = readFileSync(
         resolve(join(__dirname, '../modules/product-specification/sql/product-variants.sql')),
         'utf-8'
      )

	constructor(
		@InjectDataSource(DATA_SOURCE_ERP) private readonly dataSourceERP: DataSource,
		@InjectModel(ProductSpecification.name)
		private readonly productSpecificationModel: Model<ProductSpecificationDocument>
	) {}

	@Cron(CronExpression.EVERY_HOUR, {
		name: 'SYNC_PRODUCT_SPECIFICATION'
	})
	async handleSyncProductSpecification() {
		try {
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
         
         const data=Array.from(brandMap, ([brand_name, products]) => ({
			brand_name,
			product_variants: Array.from(products, ([factory_shoes_style, { cust_shoes_style, variants }]) => ({
				factory_shoes_style,
				cust_shoes_style,
				specs: variants
			}))
		}))

			const operations: AnyBulkWriteOperation<ProductSpecificationDocument>[] = []

			for (const item of data) {
				for (const variant of item.product_variants) {
					operations.push({
						updateOne: {
							filter: {
								brand_name: item.brand_name,
								factory_shoes_style: variant.factory_shoes_style,
								cust_shoes_style: variant.cust_shoes_style
							},
							update: {
								$set: {
									brand_name: item.brand_name,
									factory_shoes_style: variant.factory_shoes_style,
									cust_shoes_style: variant.cust_shoes_style,
									product_variants: variant.specs
								}
							},
							upsert: true
						}
					})
				}
			}

			if (operations.length === 0) {
				this.logger.warn('No product specification data to sync.')
				return
			}

			const result = await this.productSpecificationModel.bulkWrite(operations, { ordered: false })

			this.logger.log(
				`Sync product specification completed. matched=${result.matchedCount}, modified=${result.modifiedCount}, upserted=${result.upsertedCount}`
			)
		} catch (error) {
			this.logger.error(
				error instanceof Error
					? error.message
					: 'An unknown error occurred during sync product specification.'
			)
		}
	}
}
