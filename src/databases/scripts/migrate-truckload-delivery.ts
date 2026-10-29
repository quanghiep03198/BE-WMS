import { AnyBulkWriteOperation, Types } from 'mongoose'
import { env, SuperJson } from '../../common/utils'
import {
	TruckloadDelivery,
	TruckloadDeliveryDocument
} from '../../modules/truckload-delivery/infrastructure/persistence/mongodb/schemas/truckload-delivery.schema'
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

async function execute() {
	const logger = new Logger('SyncTruckloadDelivery')

	if (typeof args.mssqlHost !== 'string') {
		logger.error('MSSQL host is not specified')
		process.exit(1)
	}

	if (typeof args.mongoDbName !== 'string' || !args.mongoDbName) {
		logger.error('MongoDB database name is not specified')
		process.exit(1)
	}

	const mssqlManager = new MssqlManager(args.mssqlHost)
	const mongoManager = new MongoManager()

	let batch: Array<AnyBulkWriteOperation<TruckloadDeliveryDocument>> = []
	let totalProcessed = 0
	const BATCH_SIZE = 100

	try {
		await mssqlManager.connect()
		await mongoManager.connect()

		const createdBy = await mongoManager.getRepository('users').findOne({ username: '1009006' })

		const request = mssqlManager.pool.request()

		request.stream = true

		request.on('row', async (row) => {
			const packing = SuperJson.parse(row.packing)

			batch.push({
				updateOne: {
					filter: { dispatch_order: row.dispatch_order },
					update: {
						$set: {
							...row,
							total_outbound_qty: packing.reduce((sum, pk) => sum + pk.outbound_qty, 0),
							packing: packing.map((pk) => ({
								...pk,
								created_at: new Date(pk.created_at),
								created_by: new Types.ObjectId(String(pk.created_by)),
								updated_at: new Date(pk.updated_at)
							})),
							created_by: new Types.ObjectId(String(row.created_by))
						}
					},
					upsert: true
				}
			})
			if (batch.length >= BATCH_SIZE) {
				try {
					request.pause()
					await mongoManager
						.getRepository<TruckloadDeliveryDocument>('truckload_delivery')
						.bulkWrite(batch, { ordered: false })
					totalProcessed += batch.length
					logger.info(`Synchronized ${totalProcessed} rows`)
					batch = [] // Reset batch
				} catch (error) {
					logger.error('Error during bulk write: ' + error)
				} finally {
					request.resume() // Tiếp tục đọc stream
				}
			}
		})

		await request.query<TruckloadDelivery>(/* SQL */ `
			SELECT   a.dispatch_order,
						MIN(a.created) AS created_at,
						a.factory_code,
						a.approval_status,
						a.license_plate,
						IIF (a.container_number = '', NULL, a.container_number) AS container_number,
						a.punctured_container,
						a.smelling_container,
						a.moist_container,
						c.packing,
						a.factory_entrance_time,
						a.container_sealing_time,
						a.factory_departure_time,
						MAX(b.snap_time) AS license_plate_capture_time,
						b.images AS license_plate_image,
						MAX(a.ie_signature) AS ie_signature,
						MAX(a.warehouse_officer_signature) AS warehouse_officer_signature,
						MAX(a.security_1_signature) AS security_1_signature,
						MAX(a.security_2_signature) AS security_2_signature,
						'${createdBy._id}' AS created_by
			FROM     DV_DATA_LAKE.dbo.dv_truckload_delivery AS a
						LEFT OUTER JOIN
						DV_DATA_LAKE.dbo.dv_carlicenseplates AS b
						ON TRIM(UPPER(a.license_plate)) = TRIM(UPPER(b.plate_name))
							AND b.snap_time BETWEEN DATEADD(MINUTE, 1, a.container_sealing_time) AND DATEADD(MINUTE, 30, a.factory_departure_time) CROSS APPLY (SELECT dd.po,
																																																					dd.outbound_qty,
																																																					a.created AS created_at,
																																																					a.updated AS updated_at,
																																																					'${createdBy._id}' AS created_by
																																																			FROM   DV_DATA_LAKE.dbo.dv_truckload_delivery AS dd
																																																			WHERE  dd.dispatch_order = a.dispatch_order
																																																					AND dd.isactive = 'Y'
																																																			FOR    JSON PATH) AS c(packing)
			WHERE    a.isactive = 'Y'
			GROUP BY a.dispatch_order, a.factory_code, b.plate_name, a.license_plate, b.images, a.container_number, a.factory_entrance_time, a.container_sealing_time, a.factory_departure_time, a.approval_status, a.punctured_container, a.smelling_container, a.moist_container, c.packing;
			`)
	} catch (error) {
		logger.error(error as Error)
	} finally {
		process.exit(1)
	}
}

execute()
