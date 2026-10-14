import omit from 'lodash/omit'
import { MongoManager } from './libs/mongoose'
import { MssqlManager } from './libs/mssql'

import chunk from 'lodash/chunk'
import { isIPv4 } from 'net'
import { getArgs } from './utils/get-args'
import { Logger } from './utils/logger'

const args = getArgs({
	mssqlHost: {
		type: 'string'
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
	try {
		const epcMatchQuery = await mssqlManager.query<{
			epc: string
			mo_no: string
			factory_shoes_style: string
			cust_shoes_style: string
			size_numcode: string
			color_sn: string
		}>(/* SQL */ `
		   SELECT EPC_Code AS epc,
		      ISNULL(mo_no_actual, mo_no) AS mo_no,
		      shoestyle_codefactory AS factory_shoes_style,
		      cust_shoestyle AS cust_shoes_style,
		      factory_code_produce,
		      wuerp_vnrd.dbo.NORMALIZE_SIZE_NUMBER(size_numcode),
		      color_sn
		   FROM DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust
		   WHERE LEFT(ISNULL(mo_no_actual, mo_no), 2) >= '14'
		`)

		const epcMatchData = epcMatchQuery.getRawMany()

		const chunkBulkWriteOps = chunk(
			epcMatchData.map((item) => {
				return {
					updateOne: {
						filter: { epc: item.epc },
						update: {
							$set: omit(item, ['epc'])
						},
						upsert: true
					}
				}
			}),
			1000
		)

		const result = await Promise.all(
			chunkBulkWriteOps.map(
				async (bulkWriteOps) =>
					await mongoManager.getRepository('finished_goods_epcs_match').bulkWrite(bulkWriteOps, {
						ordered: false,
						readConcern: { level: 'majority' },
						writeConcern: { w: 'majority' }
					})
			)
		)

		logger.info(
			'✅',
			result.reduce((acc, curr) => acc + curr.modifiedCount + curr.upsertedCount, 0) + ' records updated'
		)
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
