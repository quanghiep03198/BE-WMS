import { SuperJson } from '@common/utils'
import { DATA_SOURCE_ERP, DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import {
	ProductSpecification,
	ProductSpecificationDocument
} from '@modules/product-specification/schemas/product-specification.schema'
import productVariantsQuery from '@modules/product-specification/sql/product-variants.sql'
import { ProductVariant } from '@modules/product-specification/types'
import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Cron, CronExpression } from '@nestjs/schedule'
import { InjectDataSource } from '@nestjs/typeorm'
import { AnyBulkWriteOperation, Model } from 'mongoose'
import { DataSource } from 'typeorm'

@Injectable()
export class SyncProductSpecificationTask {
	private readonly logger = new Logger(SyncProductSpecificationTask.name)

	constructor(
		@InjectDataSource(DATA_SOURCE_ERP) private readonly dataSourceERP: DataSource,
		@InjectModel(ProductSpecification.name, DATA_WAREHOUSE_CONNECTION)
		private readonly productSpecificationModel: Model<ProductSpecificationDocument>
	) {}

	@Cron(CronExpression.EVERY_5_MINUTES, {
		name: 'SYNC_PRODUCT_SPECIFICATION'
	})
	async handleSyncProductSpecification() {
		try {
			const rawData = await this.dataSourceERP.query<ProductSpecification[]>(productVariantsQuery)

			const data = rawData.map((item) => ({
				...item,
				product_variants: SuperJson.isValid(item.product_variants)
					? SuperJson.parse<ProductVariant[]>(item.product_variants, 1)
					: []
			}))

			const operations: AnyBulkWriteOperation<ProductSpecificationDocument>[] = []

			for (const item of data) {
				operations.push({
					updateOne: {
						filter: {
							brand_name: item.brand_name,
							factory_shoes_style: item.factory_shoes_style,
							cust_shoes_style: item.cust_shoes_style
						},
						update: {
							$set: {
								brand_name: item.brand_name,
								factory_shoes_style: item.factory_shoes_style,
								cust_shoes_style: item.cust_shoes_style,
								product_variants: item.product_variants
							}
						},
						upsert: true
					}
				})
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
				error instanceof Error ? error.message : 'An unknown error occurred during sync product specification.'
			)
		}
	}
}
