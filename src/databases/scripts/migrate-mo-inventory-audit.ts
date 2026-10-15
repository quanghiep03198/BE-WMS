import { MoInventoryAuditDocument } from '@modules/inventory/infrastructure/persistence/mongodb/schemas/inventory-audit.schema'
import { format } from 'date-fns'
import 'dotenv/config'
import { AnyBulkWriteOperation } from 'mongoose'
import { SuperJson } from '../../common/utils'
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
	},
	factory: {
		type: 'string',
		description: 'Factory code',
		default: process.env.FACTORY_CODE
	}
})

async function main() {
	const logger = new Logger('Reset Test Data')
	if (!args.mssqlHost) {
		logger.error('Missing required argument: --host <mssql_host>')
		process.exit(1)
	}

	const mssqlManager = new MssqlManager(args.mssqlHost as string)
	const mongoManager = new MongoManager()

	await mssqlManager.connect()
	await mongoManager.connect()

	let batch: Array<AnyBulkWriteOperation<MoInventoryAuditDocument>> = []
	let totalProcessed: number = 0
	const BATCH_SIZE = 1

	try {
		const request = mssqlManager.pool.request()

		request.stream = true

		request.on('row', async (row) => {
			batch.push({
				updateOne: {
					filter: { mo_no: row.mo_no, year_month: row.year_month },
					update: {
						$set: {
							year_month: row.year_month,
							mo_no: row.mo_no,
							size_ledger: SuperJson.parse(row.size_ledger),
							storage_locations: row.storage_locations,
							inventory_closure_status: row.year_month < format(new Date(), 'yyyy-MM') ? 'completed' : 'pending'
						}
					},
					upsert: true
				}
			})

			if (batch.length >= BATCH_SIZE) {
				try {
					request.pause()
					await mongoManager.getRepository<MoInventoryAuditDocument>('mo_inventory_audit').bulkWrite(batch)
					totalProcessed += batch.length
					batch = []
					request.resume()
				} catch (error) {
					logger.error(error)
				} finally {
					request.resume()
				}
			}
		})

		request.on('error', logger.error)

		request.on('done', () => logger.info(`Finished processing. Total processed: ${totalProcessed}`))

		await request.query(/* SQL */ `
         DECLARE @factory NVARCHAR(10) = '${args.factory}';

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
            size_json
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
                  sj.size_ledger,
                  CONCAT(LEFT(a.inv_yearmonth, 4), '-', RIGHT(a.inv_yearmonth, 2)) AS year_month
         FROM     agg_data AS a
                  LEFT OUTER JOIN storage_list_cte AS s
                  ON s.mo_no = a.mo_no
                  LEFT OUTER JOIN size_json AS sj
                  ON sj.mo_no = a.mo_no
                     AND sj.inv_yearmonth = a.inv_yearmonth
                     AND sj.brand_name = a.brand_name
                     AND sj.inv_type = a.inv_type
         WHERE    LEFT(a.mo_no, 2) >= '14'
         ORDER BY a.inv_yearmonth ASC
         OPTION (OPTIMIZE FOR UNKNOWN, MAXDOP 8, FAST 100);
         `)
	} catch (error) {
		if (error instanceof Error) logger.error(error)
	} finally {
		await mssqlManager.disconnect()
		process.exit(0)
	}
}

main()
