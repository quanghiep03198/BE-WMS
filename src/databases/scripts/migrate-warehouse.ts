import { Types } from 'mongoose'
import { isIPv4 } from 'net'
import { env } from '../../common/utils'
import { UserDocument } from '../../modules/user/infrastructure/persistence/mongodb/schemas/user.schema'
import { StorageLocationDocument } from '../../modules/warehouse/infrastructure/persistence/mongodb/schemas/storage-location.schema'
import { WarehouseDocument } from '../../modules/warehouse/infrastructure/persistence/mongodb/schemas/warehouse.schema'
import { MongoManager } from './libs/mongoose'
import { MssqlManager } from './libs/mssql'
import { getArgs } from './utils/get-args'
import { Logger } from './utils/logger'

const args = getArgs({
	mssqlHost: {
		type: 'string',
		description: 'MSSQL host',
		default: env('DB_HOST')
	},
	mongoDbName: {
		type: 'string',
		description: 'MongoDB database name',
		default: env('MONGO_DB_NAME')
	},
	tenant: {
		type: 'string',
		description: 'Factory name',
		default: env('APP_TENANCY')
	}
})

async function main() {
	const logger = new Logger('MigrateWarehouse')

	if (typeof args.mssqlHost !== 'string' || !isIPv4(args.mssqlHost)) {
		logger.error(`Invalid MSSQL host: ${args.mssqlHost}`)
		process.exit(1)
	}

	if (typeof args.mongoDbName !== 'string' || args.mongoDbName.trim() === '') {
		logger.error(`Invalid MongoDB database name: ${args.mongoDbName}`)
		process.exit(1)
	}

	const mssqlManager = new MssqlManager(args.mssqlHost)
	const mongoManager = new MongoManager(args.mongoDbName)

	try {
		await mssqlManager.connect()
		await mongoManager.connect()

		const warehouseData = (
			await mssqlManager.query<{ warehouse_num: string; warehouse_name: string; created: Date }>(
				/* SQL */ `SELECT * FROM DV_DATA_LAKE.dbo.dv_warehouseccodemst WHERE cofactory_code = '${args.tenant}'`
			)
		).getRawMany()

		const storageLocationData = (
			await mssqlManager.query<{ warehouse_num: string; storage_name: string; created: Date }>(/* SQL */ `
            SELECT *
            FROM   DV_DATA_LAKE.dbo.dv_warehouseccodedet
            WHERE  cofactory_code = '${args.tenant}'
                  AND warehouse_num IN (${warehouseData.map((w) => `'${w.warehouse_num}'`).join(',')});
            `)
		).getRawMany()

		await mongoManager.withTransaction(async (session) => {
			const createdBy = await mongoManager
				.getRepository<UserDocument>('users')
				.findOne({ username: 'quanghiep' }, { session })

			await mongoManager.getRepository<WarehouseDocument>('warehouses').bulkWrite(
				warehouseData.map((row) => ({
					updateOne: {
						filter: { name: row.warehouse_name.replace(/[^A-Za-z0-9]/g, 'PW') },
						update: {
							$set: {
								name: row.warehouse_name.replace(/[^A-Za-z0-9]/g, 'PW'),
								legacy_code: row.warehouse_num,
								created_at: new Date(row.created),
								created_by: new Types.ObjectId(createdBy?._id)
							}
						},
						upsert: true
					}
				})),
				{ session }
			)
			const warehouses = await mongoManager
				.getRepository<WarehouseDocument & { legacy_code: string }>('warehouses')
				.find({}, { session })
				.toArray()

			logger.info(`Synchronized ${warehouses.length} warehouses.`)

			await mongoManager.getRepository<StorageLocationDocument>('storage_locations').bulkWrite(
				storageLocationData.map((row) => {
					const warehouse = warehouses.find((w) => w.legacy_code === row.warehouse_num)
					return {
						updateOne: {
							filter: { warehouse: warehouse?._id, name: row.storage_name },
							update: {
								$set: {
									name: row.storage_name,
									warehouse: warehouse?._id,
									created_at: new Date(row.created),
									created_by: new Types.ObjectId(createdBy?._id)
								}
							},
							upsert: true
						}
					}
				}),
				{ session }
			)

			const storageLocations = await mongoManager
				.getRepository<StorageLocationDocument>('storage_locations')
				.find({}, { session })
				.toArray()

			logger.info(`Synchronized ${storageLocations.length} storage locations.`)

			await mongoManager
				.getRepository<WarehouseDocument>('warehouses')
				.updateMany({}, [{ $unset: ['legacy_code'] }], { session })
		})

		logger.info('Synchronized Warehouse & Storage location data completed successfully.')
	} catch (error) {
		logger.error(error)
	} finally {
		await mongoManager.disconnect()
		await mssqlManager.disconnect()
		process.exit(1)
	}
}

main()
