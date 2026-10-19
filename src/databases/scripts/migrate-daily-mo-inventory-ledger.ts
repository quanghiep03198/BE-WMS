import { env, SuperJson } from '@common/utils'
import { generateShortId } from '@common/utils/short-id.util'
import { DailyMoInventoryLedgerDocument } from '@modules/finished-goods/infrastructure/persistence/mongodb/schemas/daily-mo-inventory-ledger.schema'
import { isEmpty } from 'lodash'
import { AnyBulkWriteOperation, LeanDocument } from 'mongoose'
import { isIPv4 } from 'net'
import { MongoManager } from './libs/mongoose'
import { MssqlManager } from './libs/mssql'
import { getArgs } from './utils/get-args'
import { Logger } from './utils/logger'

const args = getArgs({
	mssqlHost: {
		type: 'string',
		default: env('DB_HOST')
	},
	mongoDbName: {
		type: 'string',
		default: env('MONGO_DB_NAME')
	},
	moPrefix: {
		type: 'string',
		default: '15'
	}
})

async function execute() {
	const logger = new Logger()

	if (typeof args.mssqlHost !== 'string' || !isIPv4(args.mssqlHost)) {
		logger.error('Invalid MSSQL host. It must be a string and not an IPv4 address.')
		process.exit(1)
	}

	if (typeof args.mongoDbName !== 'string' || args.mongoDbName.trim() === '') {
		logger.error('Invalid MongoDB database name. It must be a non-empty string.')
		process.exit(1)
	}

	const mssqlManager = new MssqlManager(args.mssqlHost)
	const mongoManager = new MongoManager(args.mongoDbName)

	const BATCH_SIZE = 100
	let batch: Array<AnyBulkWriteOperation<DailyMoInventoryLedgerDocument>> = []
	let totalProcessed: number = 0
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
				const operations: Array<AnyBulkWriteOperation<DailyMoInventoryLedgerDocument>> = batch
				batch = []
				const flush = mongoManager
					.getRepository<DailyMoInventoryLedgerDocument>('daily_mo_inventory_ledger')
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
					process.exitCode = 1
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

		request.on(
			'row',
			async (
				row: LeanDocument<DailyMoInventoryLedgerDocument> & {
					transaction_history: Array<ValueOfRecord<DailyMoInventoryLedgerDocument['transaction_history']>>
				}
			) => {
				const transactionHistory = SuperJson.parse<
					Array<ValueOfRecord<DailyMoInventoryLedgerDocument['transaction_history']>>
				>(row.transaction_history)
				const sizeLedger = SuperJson.parse<LeanDocument<DailyMoInventoryLedgerDocument>['size_ledger']>(
					row.size_ledger
				)

				if (Array.isArray(transactionHistory) && transactionHistory.length > 0 && !isEmpty(sizeLedger))
					batch.push({
						updateOne: {
							filter: { mo_no: row.mo_no, date: row.date }, // Thay bằng khóa chính của bạn
							update: {
								$set: {
									mo_no: row.mo_no,
									date: row.date,
									size_ledger: sizeLedger,
									created_at: new Date(row.date),
									transaction_history: transactionHistory.reduce((acc, curr) => {
										const tx = generateShortId()
										return {
											...acc,
											[tx]: {
												...curr,
												assembly_line: curr.assembly_line.replace(/[^A-Za-z0-9]/g, ''),
												voided: false
											}
										}
									}, {})
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
			}
		)

		request.on('done', async () => {
			try {
				await flushBatch(true)
				logger.info(
					`Daily Manufacturing Order's transactions migration completed successfully. ${totalProcessed} rows affected.`
				)
				resolveStream()
			} catch (error) {
				logger.error('Error during final bulk write: ' + error)
				rejectStream(error)
			}
		})

		const queryPromise = request.query(/* SQL */ `
         DECLARE @MoPrefix NVARCHAR(2) = '${args.moPrefix}';

         WITH src AS
         (
            SELECT EPC_Code, mo_no, size_code, rfid_status, station_suffix,
                  storage, quantity, record_time, dept_name, isactive
            FROM   DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet WITH (NOLOCK)
            WHERE  LEFT(mo_no, 2) = @MoPrefix
                  AND isactive = 'Y'
                  AND rfid_status = 'A'
                  AND station_suffix IN ('101', '102')
                  AND EPC_Code NOT LIKE '303429%'
                  AND EPC_Code NOT LIKE 'E28%'
                  AND mo_no NOT IN ('13D05B006', '13A08C003')
            UNION
            SELECT EPC_Code, mo_no, size_code, rfid_status, station_suffix,
                  storage, quantity, record_time, dept_name, isactive
            FROM   DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily WITH (NOLOCK)
            WHERE  LEFT(mo_no, 2) = @MoPrefix
                  AND isactive = 'Y'
                  AND rfid_status = 'A'
                  AND station_suffix IN ('101', '102')
                  AND EPC_Code NOT LIKE '303429%'
                  AND EPC_Code NOT LIKE 'E28%'
                  AND mo_no NOT IN ('13D05B006', '13A08C003')
         ),
         base AS
         (
            SELECT s.EPC_Code,
                  s.mo_no,
                  s.size_code,
                  CONVERT(DATE, s.record_time)            AS rec_date,
                  CONVERT(VARCHAR(5), s.record_time, 108) AS rec_time,      -- HH:mm
                  s.dept_name           AS assembly_line,
                  w.storage_name                          AS storage_location
            FROM   src s
            LEFT JOIN DV_DATA_LAKE.dbo.dv_warehouseccodedet w WITH (NOLOCK)
                  ON w.storage_num = s.storage
         ),
         -- size_ledger theo ngày + mo_no
         size_agg AS
         (
            SELECT rec_date, mo_no, size_code, COUNT(DISTINCT EPC_Code) AS qty
            FROM   base
            GROUP BY rec_date, mo_no, size_code
         ),
         size_ledger_day AS
         (
            SELECT rec_date, mo_no,
                  '{' + STRING_AGG(
                           CAST('"' + STRING_ESCAPE(COALESCE(size_code, ''), 'json')
                                 + '":{"stocked_in_qty":' + CAST(qty AS VARCHAR(20)) + '}' AS NVARCHAR(MAX)),
                           ',') WITHIN GROUP (ORDER BY size_code)
                  + '}' AS size_ledger
            FROM   size_agg
            GROUP BY rec_date, mo_no
         ),
         -- size_ledger theo time + assembly_line + storage_location
         tx_agg AS
         (
            SELECT rec_date, mo_no, rec_time, assembly_line, storage_location,
                  size_code, COUNT(DISTINCT EPC_Code) AS qty
            FROM   base
            GROUP BY rec_date, mo_no, rec_time, assembly_line, storage_location, size_code
         ),
         tx_slot AS
         (
            SELECT rec_date, mo_no, rec_time, assembly_line, storage_location,
                  '{' + STRING_AGG(
                           CAST('"' + STRING_ESCAPE(COALESCE(size_code, ''), 'json')
                                 + '":{"stocked_in_qty":' + CAST(qty AS VARCHAR(20)) + '}' AS NVARCHAR(MAX)),
                           ',') WITHIN GROUP (ORDER BY size_code)
                  + '}' AS size_ledger
            FROM   tx_agg
            GROUP BY rec_date, mo_no, rec_time, assembly_line, storage_location
         ),
         tx_day AS
         (
            SELECT t1.rec_date, t1.mo_no,
                  (
                        SELECT t2.rec_time AS [time],
                              t2.assembly_line,
                              t2.storage_location,
                              JSON_QUERY(t2.size_ledger) AS size_ledger
                        FROM   tx_slot t2
                        WHERE  t2.rec_date = t1.rec_date
                              AND t2.mo_no = t1.mo_no
                        ORDER BY t2.rec_time, t2.assembly_line, t2.storage_location
                        FOR JSON PATH
                  ) AS transaction_history
            FROM   (SELECT DISTINCT rec_date, mo_no FROM base) t1
         )
         SELECT sl.mo_no,
               CONVERT(VARCHAR(10), sl.rec_date, 23)  AS [date],        -- yyyy-MM-dd
               JSON_QUERY(sl.size_ledger)             AS size_ledger,
               JSON_QUERY(tx.transaction_history)     AS transaction_history
         FROM   size_ledger_day sl
         JOIN   tx_day tx
               ON tx.rec_date = sl.rec_date
               AND tx.mo_no    = sl.mo_no
         ORDER BY sl.mo_no, sl.rec_date;
         `)

		await Promise.all([queryPromise, streamCompletion])
	} catch (error) {
		logger.error(error)
		process.exitCode = 1
	} finally {
		await mssqlManager.disconnect()
		await mongoManager.disconnect()
		process.exit(process.exitCode ?? 0)
	}
}

execute()
