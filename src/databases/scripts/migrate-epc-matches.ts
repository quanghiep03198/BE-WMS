import omit from 'lodash/omit'
import { AnyBulkWriteOperation, LeanDocument } from 'mongoose'
import { isIPv4 } from 'net'
import { FinishedGoodsEpcMatchDocument } from '../../modules/finished-goods/infrastructure/persistence/mongodb/schemas/epc-match.schema'
import { MongoManager } from './libs/mongoose'
import { MssqlManager } from './libs/mssql'
import { getArgs } from './utils/get-args'
import { Logger } from './utils/logger'

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

async function main() {
	const logger = new Logger('SyncEpcMatch')

	if (typeof args.mssqlHost !== 'string' || !isIPv4(args.mssqlHost)) {
		logger.error('Missing required argument: --mssqlHost <mssql_host>')
		process.exit(1)
	}

	if (typeof args.mongoDbName !== 'string' || !args.mongoDbName) {
		logger.error('Missing required argument: --mongoDbName <mongo_db_name>')
		process.exit(1)
	}

	const mssqlManager = new MssqlManager(args.mssqlHost)
	const mongoManager = new MongoManager(args.mongoDbName)

	await mssqlManager.connect()
	await mongoManager.connect()

	let batch: Array<AnyBulkWriteOperation<FinishedGoodsEpcMatchDocument>> = []
	let totalProcessed = 0
	const BATCH_SIZE = 1000
	let pendingFlush: Promise<void> | undefined

	try {
		const request = mssqlManager.pool.request()

		let resolveStream!: () => void
		let rejectStream!: (error: unknown) => void
		const streamCompletion = new Promise<void>((resolve, reject) => {
			resolveStream = resolve
			rejectStream = reject
		})

		request.stream = true

		const flushBatch = async (includePartialBatch = false): Promise<void> => {
			if (pendingFlush) {
				await pendingFlush
			}

			while (batch.length >= BATCH_SIZE || (includePartialBatch && batch.length > 0)) {
				const operations: Array<AnyBulkWriteOperation<FinishedGoodsEpcMatchDocument>> = batch
				batch = []
				const flush = mongoManager
					.getRepository<FinishedGoodsEpcMatchDocument>('finished_goods_epcs_match')
					.bulkWrite(operations, { ordered: false })
					.then(() => {
						totalProcessed += operations.length
						logger.info(`Synchronized ${totalProcessed} rows`)
					})
				pendingFlush = flush

				try {
					await flush
				} catch (error) {
					batch = [...operations, ...batch]
					throw error
				} finally {
					pendingFlush = undefined
				}
			}
		}

		request.on('error', (err) => {
			logger.error(err)
			rejectStream(err)
		})

		request.on('row', async (row: FinishedGoodsEpcMatchDocument) => {
			batch.push({
				updateOne: {
					filter: { epc: row.epc }, // Thay bằng khóa chính của bạn
					update: { $set: omit(row, ['epc']) },
					upsert: true
				}
			})

			if (batch.length >= BATCH_SIZE) {
				request.pause()
				try {
					await flushBatch()
					request.resume()
				} catch (error) {
					logger.error('Error during bulk write: ' + error)
					rejectStream(error)
				}
			}
		})

		request.on('done', async () => {
			try {
				await flushBatch(true)
				logger.info(`Finished goods EPCs migration completed successfully. ${totalProcessed} rows affected.`)
				resolveStream()
			} catch (error) {
				logger.error('Error during final bulk write: ' + error)
				rejectStream(error)
			}
		})

		await request.query<LeanDocument<FinishedGoodsEpcMatchDocument>>(/* SQL */ `
		   SELECT EPC_Code AS epc,
		      ISNULL(mo_no_actual, mo_no) AS mo_no,
		      shoestyle_codefactory AS factory_shoes_style,
		      cust_shoestyle AS cust_shoes_style,
		      factory_code_produce,
		      wuerp_vnrd.dbo.NORMALIZE_SIZE_NUMBER(size_numcode) AS size_numcode,
		      color_sn
		   FROM DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust
		   WHERE LEFT(ISNULL(mo_no_actual, mo_no), 2) >= '15'
		`)
	} catch (error) {
		logger.error(error as Error)
		process.exit(1)
	} finally {
		mssqlManager.disconnect()
		mongoManager.disconnect()
		process.exit(0)
	}
}

main()
