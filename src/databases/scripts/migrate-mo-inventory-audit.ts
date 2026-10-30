import 'dotenv/config'
import { AnyBulkWriteOperation } from 'mongoose'
import { env, SuperJson } from '../../common/utils'
import { MoInventoryAuditDocument } from '../../modules/inventory/infrastructure/persistence/mongodb/schemas/inventory-audit.schema'
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
		description: 'Factory code'
	}
})

async function main() {
	const logger = new Logger('Reset Test Data')
	if (!args.mssqlHost) {
		logger.error('Missing required argument: --host <mssql_host>')
		process.exit(1)
	}

	const mssqlManager = new MssqlManager(args.mssqlHost)
	const mongoManager = new MongoManager()

	let batch: Array<AnyBulkWriteOperation<MoInventoryAuditDocument>> = []
	let totalProcessed: number = 0
	let pendingFlush: Promise<void> | undefined
	const BATCH_SIZE = 100

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
				{
					const operations = batch
					batch = []
					const flush = mongoManager
						.getRepository<MoInventoryAuditDocument>('mo_inventory_audit')
						.bulkWrite(operations, { ordered: false })
						.then(() => {
							totalProcessed += operations.length
							logger.info(`Synchronized ${totalProcessed} documents so far.`)
						})

					pendingFlush = flush

					await flush.finally(() => {
						pendingFlush = undefined
					})
				}
			}
		}

		const resolveStorageLocations = async () =>
			await mongoManager.getRepository<MoInventoryAuditDocument>('mo_inventory_audit').aggregate([
				// Chỉ xử lý doc mà storage_locations đang là mảng string
				{ $match: { 'storage_locations.0': { $type: 'string' } } },

				// Chuẩn hoá name (schema StorageLocation đang trim + uppercase)
				{
					$set: {
						storage_locations: {
							$map: {
								input: {
									$filter: {
										input: '$storage_locations',
										cond: { $eq: [{ $type: '$$this' }, 'string'] }
									}
								},
								as: 'n',
								in: { $toUpper: { $trim: { input: '$$n' } } }
							}
						}
					}
				},

				// Tìm _id tương ứng theo name
				{
					$lookup: {
						from: 'storage_locations',
						localField: 'storage_locations',
						foreignField: 'name',
						as: '_matched'
					}
				},

				// Thay mảng name bằng mảng ObjectId
				{ $set: { storage_locations: '$_matched._id' } },
				{ $unset: '_matched' },

				// Ghi đè lại vào chính collection
				{
					$merge: {
						into: 'mo_inventory_audit',
						on: '_id',
						whenMatched: 'merge',
						whenNotMatched: 'discard'
					}
				}
			])

		request.on('row', async (row) => {
			batch.push({
				updateOne: {
					filter: { mo_no: row.mo_no },
					update: {
						$set: {
							...row,
							storage_locations: row.storage_locations,
							size_ledger: SuperJson.parse(row.size_ledger)
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

		request.on('error', (error) => {
			logger.error(error)
			rejectStream(error)
		})

		request.on('done', async () => {
			try {
				await flushBatch(true)

				resolveStream()
				logger.info(`Synchronized ${totalProcessed} documents.`)
			} catch (error) {
				logger.error('Error during final bulk write: ' + error)
				rejectStream(error)
			}
		})

		const queryPromise = await request.query(/* SQL */ `
         DECLARE @factory NVARCHAR(10) = '${args.tenant}';

         WITH storage_list_cte
         AS (SELECT   a.mo_no,
                     CONCAT('[', STRING_AGG(CAST(CONCAT('"', STRING_ESCAPE(b.storage_name, 'json'), '"') AS NVARCHAR(MAX)), ',')
                           WITHIN GROUP (ORDER BY a.storage ASC), ']') AS storage_locations
            FROM     (SELECT DISTINCT storage, mo_no
                     FROM   DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily
                     WHERE  isactive = 'Y'
                              AND storage IS NOT NULL
                              AND dept_name IS NOT NULL) AS a
                     LEFT OUTER JOIN DV_DATA_LAKE.dbo.dv_warehouseccodedet AS b
                     ON b.storage_num = a.storage
            GROUP BY a.mo_no),
            agg_data_mst
         AS (SELECT   mo_no,
                     inv_yearmonth,
                     brand_name,
                     inv_type,
                     shoestyle_cofactory AS factory_shoes_style,
                     cofactory_code_mes AS factory_code,
                     SUM(ISNULL(mo_qty, 0)) AS mo_qty,
                     SUM(ISNULL(inv_initialqty, 0)) AS inv_initialqty,
                     SUM(ISNULL(inv_istotalqty, 0)) AS inv_istotalqty,
                     SUM(ISNULL(inv_manualqty, 0)) AS inv_manualqty,
                     SUM(ISNULL(inv_ostotalqty, 0)) AS inv_ostotalqty,
                     SUM(ISNULL(inv_manualqtyout, 0)) AS inv_manualqtyout,
                     SUM(ISNULL(inv_finalqty, 0)) AS inv_finalqty
            FROM     DV_DATA_LAKE.dbo.dv_invprodmst
            WHERE    isactive = 'Y'
                     AND inv_type = 'FG'
                     AND mo_no IS NOT NULL
                     AND mo_no <> 'undefined'
                     AND cofactory_code_mes = @factory
            GROUP BY cofactory_code_mes, mo_no, inv_yearmonth, brand_name, shoestyle_cofactory, inv_type, po),
            agg_data
         AS (SELECT   mo_no,
                     inv_yearmonth,
                     factory_code,
                     brand_name,
                     factory_shoes_style,
                     inv_type,
                     MAX(mo_qty) AS mo_qty,
                     SUM(inv_initialqty) AS inv_initialqty,
                     SUM(inv_istotalqty) AS inv_istotalqty,
                     SUM(inv_manualqty) AS inv_manualqty,
                     SUM(inv_ostotalqty) AS inv_ostotalqty,
                     SUM(inv_manualqtyout) AS inv_manualqtyout,
                     SUM(inv_finalqty) AS inv_finalqty
            FROM     agg_data_mst
            GROUP BY factory_code, mo_no, factory_shoes_style, inv_yearmonth, brand_name, inv_type),
            size_agg
         AS (SELECT   c.mo_no,
                     c.inv_yearmonth,
                     c.brand_name,
                     c.inv_type,
                     n.size_numcode,
                     CAST(MAX(ISNULL(c.mo_qty, 0)) AS INT) AS order_qty,
                     CAST(SUM(ISNULL(c.inv_initialqty, 0)) AS INT) AS beginning_inventory_qty,
                     CAST(SUM(ISNULL(c.inv_istotalqty, 0)) AS INT) AS stocked_in_qty,
                     CAST(SUM(ISNULL(c.inv_ostotalqty, 0)) AS INT) AS shipped_out_qty,
                     CAST(SUM(ISNULL(c.inv_manualqty, 0)) AS INT) AS supplemental_stocked_in_qty,
                     CAST(SUM(ISNULL(c.inv_manualqtyout, 0)) AS INT) AS supplemental_shipped_out_qty
            FROM     DV_DATA_LAKE.dbo.dv_invprodmst AS c
                     CROSS APPLY (SELECT wuerp_vnrd.dbo.NORMALIZE_SIZE_NUMBER(c.size_numcode) AS size_numcode) AS n
            WHERE    c.isactive = 'Y'
                     AND c.inv_type = 'FG'
                     AND c.cofactory_code_mes = @factory
                     AND n.size_numcode IS NOT NULL
            GROUP BY c.mo_no, c.inv_yearmonth, c.brand_name, c.inv_type, n.size_numcode),
            size_ledger
         AS (SELECT   mo_no,
                     inv_yearmonth,
                     brand_name,
                     inv_type,
                     CONCAT('{', STRING_AGG(CAST(CONCAT('"', STRING_ESCAPE(size_numcode, 'json'), '":{',
                           '"order_qty":', order_qty,
                           ',"beginning_inventory_qty":', beginning_inventory_qty,
                           ',"stocked_in_qty":', stocked_in_qty,
                           ',"shipped_out_qty":', shipped_out_qty,
                           ',"supplemental_stocked_in_qty":', supplemental_stocked_in_qty,
                           ',"supplemental_shipped_out_qty":', supplemental_shipped_out_qty,
                           '}') AS NVARCHAR(MAX)), ',')
                        WITHIN GROUP (ORDER BY TRY_CAST(size_numcode AS FLOAT) ASC, size_numcode ASC), '}') AS size_ledger
            FROM     size_agg
            GROUP BY mo_no, inv_yearmonth, brand_name, inv_type)
         -- * Main query
         SELECT   a.mo_no,
                  s.storage_locations,
                  sl.size_ledger,
                  CONCAT(LEFT(a.inv_yearmonth, 4), '-', RIGHT(a.inv_yearmonth, 2)) AS year_month
         FROM     agg_data AS a
                  LEFT OUTER JOIN storage_list_cte AS s
                  ON s.mo_no = a.mo_no
                  LEFT OUTER JOIN size_ledger AS sl
                  ON sl.mo_no = a.mo_no
                     AND sl.inv_yearmonth = a.inv_yearmonth
                     AND sl.brand_name = a.brand_name
                     AND sl.inv_type = a.inv_type
         WHERE    LEFT(a.mo_no, 2) >= '15'
         ORDER BY a.inv_yearmonth ASC
         OPTION (OPTIMIZE FOR UNKNOWN);
         `)

		await Promise.all([queryPromise, streamCompletion])
	} catch (error) {
		if (error instanceof Error) logger.error(error)
	} finally {
		await mssqlManager.disconnect()
		process.exit(0)
	}
}

main()
