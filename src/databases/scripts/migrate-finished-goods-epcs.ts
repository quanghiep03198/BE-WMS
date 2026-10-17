import { AnyBulkWriteOperation } from 'mongoose'
import { isIPv4 } from 'net'
import { FinishedGoodsEpcStatus } from '../../modules/finished-goods/domain/constants'
import { FinishedGoodsEpcDocument } from '../../modules/finished-goods/infrastructure/persistence/mongodb/schemas/finished-goods-epc.schema'
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
	},
	all: {
		type: 'boolean',
		description: 'Whether to migrate all finished goods EPCs',
		default: false
	},
	recentOnly: {
		type: 'boolean',
		description: 'Whether to migrate only recent finished goods EPCs',
		default: false
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

	if (typeof args.device101 !== 'string' || args.device101.trim() === '') {
		logger.error('Inbound device SN is not specified')
		process.exit(1)
	}

	if (typeof args.device103 !== 'string' || args.device103.trim() === '') {
		logger.error('Outbound device SN is not specified')
		process.exit(1)
	}

	const mssqlManager = new MssqlManager(args.mssqlHost)
	const mongoManager = new MongoManager(args.mongoDbName)

	let batch: Array<AnyBulkWriteOperation<FinishedGoodsEpcDocument>> = []
	let totalProcessed = 0
	const BATCH_SIZE = 1000
	let pendingFlush: Promise<void> | undefined

	try {
		await mssqlManager.connect()
		await mongoManager.connect()

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
				const operations = batch
				batch = []
				const flush = mongoManager
					.getRepository<FinishedGoodsEpcDocument>('finished_goods_epcs')
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

		const queryPromise = request.query<FinishedGoodsEpcDocument>(/* SQL */ `
         DECLARE @InboundDeviceSn AS NVARCHAR (50) = '${args.device101}', 
			@OutboundDeviceSn AS NVARCHAR (50) = '${args.device103}';

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
						FROM   DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet AS a
								LEFT OUTER JOIN
								DV_DATA_LAKE.dbo.dv_warehouseccodedet AS b
								ON a.storage = b.storage_num
								INNER JOIN
								DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust AS c
								ON a.EPC_Code = c.EPC_Code
						WHERE  station_suffix = '101'
								AND a.EPC_Code NOT LIKE 'E28%'
						${
							!args.all
								? ''
								: /* SQL */ `
								UNION
								SELECT a.EPC_Code,
										c.size_numcode,
										c.mo_no,
										po,
										rfid_status,
										b.storage_name AS storage_location,
										a.dept_name,
										c.shoestyle_codefactory AS factory_shoes_style,
										c.color_sn AS color_sn,
										a.record_time,
										row_number() OVER (PARTITION BY a.EPC_Code, a.rfid_status ORDER BY a.record_time DESC) AS rn
								FROM   DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily AS a
										LEFT OUTER JOIN
										DV_DATA_LAKE.dbo.dv_warehouseccodedet AS b
										ON a.storage = b.storage_num
										INNER JOIN
										DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust AS c
										ON a.EPC_Code = c.EPC_Code
								WHERE  station_suffix = '101'
										AND a.EPC_Code NOT LIKE 'E28%'
										AND LEFT(a.mo_no, 2) >= '15'
										${args.recentOnly ? /* SQL */ `AND record_time >= DATEADD(DAY, -2, GETDATE())` : /* SQL */ `AND LEFT(a.mo_no, 2) >= '15'`}`
						}

					),
						epcs_at_103
			AS       (SELECT EPC_Code,
								size_code,
								mo_no,
								po,
								record_time,
								rfid_status,
								rfid_use
						FROM   DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet
						WHERE  station_suffix = '103'
								AND EPC_Code NOT LIKE 'E28%'
						${
							!args.all
								? ''
								: /* SQL */ `
								UNION
								SELECT EPC_Code,
										size_code,
										mo_no,
										po,
										record_time,
										rfid_status,
										rfid_use
								FROM   DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily
								WHERE  station_suffix = '103'
										AND EPC_Code NOT LIKE 'E28%'
										AND LEFT(mo_no, 2) >= '15'
										--AND mo_no = @Mono
										${args.recentOnly ? /* SQL */ `AND record_time >= DATEADD(DAY, -2, GETDATE())` : ''}
								`
						}
						)
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
		await Promise.all([queryPromise, streamCompletion])
	} catch (error) {
		logger.error(error)
		process.exitCode = 1
	} finally {
		await Promise.all([mongoManager.disconnect(), mssqlManager.disconnect()])
		process.exitCode = 0
		process.exit(process.exitCode)
	}
}

main()
