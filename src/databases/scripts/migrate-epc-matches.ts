import omit from 'lodash/omit'
import { MongoManager } from './libs/mongoose'
import { MssqlManager } from './libs/mssql'

import { AnyBulkWriteOperation, LeanDocument } from 'mongoose'
import { isIPv4 } from 'net'
import { FinishedGoodsEpcMatchDocument } from '../../modules/finished-goods/infrastructure/persistence/mongodb/schemas/epc-match.schema'
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

	const mssqlManager = new MssqlManager(args.mssqlHost)
	const mongoManager = new MongoManager()

	await mssqlManager.connect()
	await mongoManager.connect()

	let batch: Array<AnyBulkWriteOperation<FinishedGoodsEpcMatchDocument>> = []
	let totalProcessed = 0
	const BATCH_SIZE = 1000

	try {
		const request = mssqlManager.pool.request()

		request.stream = true

		request.on('row', async (row: LeanDocument<FinishedGoodsEpcMatchDocument>) => {
			batch.push({
				updateOne: {
					filter: { epc: row.epc },
					update: { $set: omit(row, ['epc']) },
					upsert: true
				}
			})
			if (batch.length >= BATCH_SIZE) {
				try {
					request.pause()
					await mongoManager
						.getRepository<FinishedGoodsEpcMatchDocument>('finished_goods_epcs_match')
						.bulkWrite(batch, {
							ordered: false,
							readConcern: { level: 'majority' },
							writeConcern: { w: 'majority' }
						})
					totalProcessed += batch.length
					logger.info(`Synchronized ${totalProcessed} rows`)
					batch = []
				} catch (error) {
					logger.error(error)
				} finally {
					request.resume()
				}
			}
		})

		request.on('error', logger.error)

		request.on('done', () => logger.info(`Finished synchronizing ${totalProcessed} rows`))

		await request.query<LeanDocument<FinishedGoodsEpcMatchDocument>>(/* SQL */ `
		   SELECT EPC_Code AS epc,
		      ISNULL(mo_no_actual, mo_no) AS mo_no,
		      shoestyle_codefactory AS factory_shoes_style,
		      cust_shoestyle AS cust_shoes_style,
		      factory_code_produce,
		      wuerp_vnrd.dbo.NORMALIZE_SIZE_NUMBER(size_numcode) AS size_numcode,
		      color_sn
		   FROM DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust
		   WHERE LEFT(ISNULL(mo_no_actual, mo_no), 2) >= '14'
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
