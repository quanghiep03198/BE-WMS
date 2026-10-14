import { FinishedGoodsEpcStatus } from '@modules/finished-goods/domain/constants'
import { AnyBulkWriteOperation, HydratedDocument } from 'mongoose'
import { isIPv4 } from 'net'
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
		description: 'mongoDbName database name',
		default: process.env.MONGO_DB_NAME
	},
	device101: {
		type: 'string',
		description: 'Inbound device SN',
		default: process.env.INBOUND_DEVICE_SN
	},
	device103: {
		type: 'string',
		description: 'Outbound device SN',
		default: process.env.OUTBOUND_DEVICE_SN
	}
})

interface IFinishedGoodsEpc {
	epc: string
	mo_no: string
	po: string | null
	factory_shoes_style: string
	color_sn: string
	size_numcode: string
	inbound_device_sn: string
	outbound_device_sn: string | null
	last_scanned_at: Date
	inbound_at: Date
	outbound_at: Date | null
	storage_location: string
	assembly_line: string
	status: FinishedGoodsEpcStatus
}

type FinishedGoodsEpcDocument = HydratedDocument<IFinishedGoodsEpc>

async function main() {
	const logger = new Logger('MigrateFinishedGoodsEpcs')

	if (typeof args.mssqlHost !== 'string' || !isIPv4(args.mssqlHost)) {
		logger.error('MSSQL host is not specified')
		process.exit(1)
	}

	if (typeof args.mongoDbName !== 'string') {
		logger.error('MongoDB database name is not specified')
		process.exit(1)
	}

	const mssqlManager = new MssqlManager(args.mssqlHost)
	const mongoManager = new MongoManager(args.mongoDbName)

	let batch: Array<AnyBulkWriteOperation<FinishedGoodsEpcDocument>> = []
	const BATCH_SIZE = 1000
	let totalProcessed = 0

	try {
		await mssqlManager.connect()
		await mongoManager.connect()

		const request = mssqlManager.pool.request()

		request.stream = true

		request.on('error', (err) => {
			logger.error(err)
		})

		request.on('row', async (row: IFinishedGoodsEpc) => {
			batch.push({
				updateOne: {
					filter: { epc: row.epc }, // Thay bằng khóa chính của bạn
					update: {
						$set: {
							...row,
							assembly_line:
								typeof row.assembly_line === 'string'
									? row.assembly_line.replace(/[^A-Za-z0-9]/g, '')
									: row.assembly_line
						}
					},
					upsert: true
				}
			})

			if (batch.length >= BATCH_SIZE) {
				request.pause()
				try {
					await mongoManager.getRepository<FinishedGoodsEpcDocument>('finished_goods_epcs').bulkWrite(batch)
					totalProcessed += batch.length
					logger.info(`Synchronized ${totalProcessed} rows`)
					batch = [] // Reset batch
				} catch (error) {
					logger.error('Error during bulk write: ' + error)
				}
				request.resume() // Tiếp tục đọc stream
			}
		})

		request.on('done', (result) => {
			logger.info(`Finished goods EPCs migration completed successfully. ${result.rowsAffected} rows affected.`)
		})

		await request.query<FinishedGoodsEpcDocument>(/* SQL */ `
         DECLARE @InboundDeviceSn AS NVARCHAR (50) = '${args.device101}', @OutboundDeviceSn AS NVARCHAR (50) = '${args.device103}';

			WITH     epcs_at_101
			AS       (SELECT a.EPC_Code,
								c.size_numcode,
								c.mo_no,
								po,
								rfid_status,
								b.storage_name AS storage_location,
								a.dept_name,
								c.shoestyle_codefactory AS factory_shoes_style,
								c.color_sn AS color_sn,
								a.record_time,
								row_number() OVER (PARTITION BY a.EPC_Code ORDER BY a.record_time DESC) AS rn
						FROM   DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily AS a
								LEFT OUTER JOIN
								DV_DATA_LAKE.dbo.dv_warehouseccodedet AS b
								ON a.storage = b.storage_num
								LEFT OUTER JOIN
								DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust AS c
								ON a.EPC_Code = c.EPC_Code
									AND LEFT(c.mo_no, 2) >= '14'
						WHERE  station_suffix = '101'
								AND a.EPC_Code NOT LIKE 'E28%'
								AND LEFT(a.mo_no, 2) >= '14'),
						epcs_at_103
			AS       (SELECT EPC_Code,
								size_code,
								mo_no,
								po,
								record_time,
								rfid_status,
								rfid_use
						FROM   DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily
						WHERE  station_suffix = '103'
								AND EPC_Code NOT LIKE 'E28%'
								AND LEFT(mo_no, 2) >= '14')
			SELECT   _101.EPC_Code AS epc,
						_101.size_numcode AS size_numcode,
						_101.mo_no AS mo_no,
						_103.po AS po,
						_101.factory_shoes_style AS factory_shoes_style,
						_101.color_sn AS color_sn,
						@InboundDeviceSn AS inbound_device_sn,
						IIF (_103.EPC_Code IS NOT NULL, @OutboundDeviceSn, NULL) AS outbound_device_sn,
						IIF (_103.record_time > _101.record_time, _103.record_time, _101.record_time) AS last_scanned_at,
						_101.record_time AS inbound_at,
						_103.record_time AS outbound_at,
						_101.storage_location AS storage_location,
						_101.dept_name AS assembly_line,
						1 AS inbound_times,
						CASE WHEN _103.EPC_Code IS NOT NULL THEN 'shipped' WHEN _101.rfid_status = 'B' THEN 'recalled' ELSE 'instock' END AS status
			FROM     epcs_at_101 AS _101
						LEFT OUTER JOIN
						epcs_at_103 AS _103
						ON _101.EPC_Code = _103.EPC_Code
			ORDER BY mo_no DESC;
         `)
	} catch (error) {
		logger.error(error)
		process.exit(1)
	} finally {
		mongoManager.disconnect()
		mssqlManager.disconnect()
		process.exit(1)
	}
}

main()
