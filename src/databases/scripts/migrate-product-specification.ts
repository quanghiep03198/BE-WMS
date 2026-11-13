import { isIPv4 } from 'net'
import { MongoManager } from './libs/mongoose'
import { MssqlManager } from './libs/mssql'
import { getArgs } from './utils/get-args'
import { Logger } from './utils/logger'
import { PRODUCT_SPECIFICATIONS_SQL } from './warehouse-sync/product-specifications.sql'

const args = getArgs({
	mssqlHost: {
		type: 'string',
		description: 'MSSQL host',
		default: process.env.DB_HOST
	},
	mongoDbName: {
		type: 'string',
		description: 'MongoDB database name',
		default: process.env.MONGO_DB_NAME
	}
})

async function execute() {
	const logger = new Logger('MigrateProductSpecification')
	let exitCode: number = 0

	if (typeof args.mssqlHost !== 'string' || !isIPv4(args.mssqlHost)) {
		logger.error('Host argument is missing or invalid')
		process.exit(1)
	}

	const mssqlManager = new MssqlManager(args.mssqlHost)
	const mongoManager = new MongoManager(args.mongoDbName)

	try {
		await mssqlManager.connect()
		await mongoManager.connect()

		const query = await mssqlManager.query<{
			brand_name: string
			factory_shoes_style: string
			cust_shoes_style: string
			product_variants: Array<{ color_sn: string; sizes: Array<Record<'size_numcode', string>> }>
		}>(PRODUCT_SPECIFICATIONS_SQL)

		const data = query.getRawMany()

		await mongoManager.withTransaction(async (session) => {
			await mongoManager.getRepository('product_specifications').deleteMany({}, { session })
			await mongoManager.getRepository('product_specifications').bulkWrite(
				data.map((spec) => ({
					updateOne: {
						filter: {
							brand_name: spec.brand_name,
							factory_shoes_style: spec.factory_shoes_style,
							cust_shoes_style: spec.cust_shoes_style
						},
						update: {
							$setOnInsert: {
								brand_name: spec.brand_name,
								factory_shoes_style: spec.factory_shoes_style,
								cust_shoes_style: spec.cust_shoes_style
							},
							$push: {
								product_variants: {
									$each: spec.product_variants.map((variant) => ({
										...variant,
										sizes: variant.sizes.map((sz) => sz.size_numcode)
									}))
								}
							}
						},
						upsert: true
					}
				})),
				{ session }
			)
		})
		logger.info('Product specifications migrated successfully.')
	} catch (error) {
		logger.error(error as Error)
		exitCode = 1
	} finally {
		await mssqlManager.disconnect()
		await mongoManager.disconnect()
		process.exit(exitCode)
	}
}

execute()
