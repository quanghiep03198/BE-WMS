import { SizeNumber } from '@modules/finished-goods/domain/value-objects/size-number.vo'
import { format } from 'date-fns'
import 'dotenv/config'
import { MongoManager } from './libs/mongoose'
import { MssqlManager } from './libs/mssql'
import { getArgs } from './utils/get-args'
import { Logger } from './utils/logger'

const args = getArgs({ host: { type: 'string' } })

async function main() {
	const logger = new Logger('Reset Test Data')
	if (!args.host) {
		logger.error('Missing required argument: --host <mssql_host>')
		process.exit(1)
	}

	const mssqlManager = new MssqlManager(args.host as string)
	const mongoManager = new MongoManager()

	await mssqlManager.connect()
	await mongoManager.connect()

	try {
		const monthlyInOutbound = await mssqlManager.query<{
			mo_no: string
			year_month: string
			size_numcode: string
			stocked_in_qty: number
			shipped_out_qty: number
		}>(/* SQL */ `
            DECLARE @CurrentYear INT = 2025;
            DECLARE @StartDate DATE = DATEFROMPARTS(@CurrentYear, 1, 1);  -- 01/01/năm hiện tại
            DECLARE @EndDate DATE = DATEFROMPARTS(@CurrentYear, 12, 31);  -- 31/12/năm hiện tại

            WITH months_cte AS (
               SELECT 1 [month]
               UNION ALL SELECT 2
               UNION ALL SELECT 3
               UNION ALL SELECT 4
               UNION ALL SELECT 5
               UNION ALL SELECT 6
               UNION ALL SELECT 7
               UNION ALL SELECT 8
               UNION ALL SELECT 9
               UNION ALL SELECT 10
               UNION ALL SELECT 11
               UNION ALL SELECT 12
            ),
            -- Inbound data
            inbound_combined AS (
               SELECT 
                  mo_no,
                  (SELECT MAX(value) FROM STRING_SPLIT(size_code, '/')) AS size_numcode,
                  MONTH(record_time) AS month,
                  quantity
               FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily WITH (NOLOCK)
               WHERE 
                  isactive = 'Y'
                  AND record_time >= @StartDate 
                  AND record_time <= @EndDate
                  AND rfid_status = 'A'
                  AND station_suffix = '101'
                  AND mo_no IS NOT NULL
                  AND EPC_Code NOT LIKE '303429%'
            ),
            -- Outbound data
            outbound_combined AS (
               SELECT 
                  mo_no,
                  (SELECT MAX(value) FROM STRING_SPLIT(size_code, '/')) AS size_numcode,  
                  MONTH(record_time) AS month,
                  quantity
               FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily WITH (NOLOCK)
               WHERE 
                  isactive = 'Y'
                  AND record_time >= @StartDate 
                  AND record_time <= @EndDate
                  AND rfid_status = 'B'
                  AND station_suffix = '103'
                  AND mo_no IS NOT NULL
                  AND EPC_Code NOT LIKE '303429%'
            ),
            -- Tổng inbound theo tháng, mo_no, size_numcode
            total_inbound AS (
               SELECT 
                  month,
                  mo_no, 
                  size_numcode,
                  SUM(ABS(quantity)) AS inbound_qty
               FROM inbound_combined
               GROUP BY month, mo_no, size_numcode
            ),
            -- Tổng outbound theo tháng, mo_no, size_numcode
            total_outbound AS (
               SELECT 
                  month,
                  mo_no, 
                  size_numcode,
                  SUM(ABS(quantity)) AS outbound_qty
               FROM outbound_combined
               GROUP BY month, mo_no, size_numcode
            )
            -- Kết hợp inbound và outbound
            SELECT 
               CONCAT(@CurrentYear, '-', FORMAT(COALESCE(i.month, o.month), '00')) AS year_month,
               COALESCE(i.mo_no, o.mo_no) AS mo_no,
               COALESCE(i.size_numcode, o.size_numcode) AS size_numcode,
               COALESCE(i.inbound_qty, 0) AS stocked_in_qty,
               COALESCE(o.outbound_qty, 0) AS shipped_out_qty
            FROM total_inbound i
            FULL OUTER JOIN total_outbound o 
               ON i.month = o.month 
               AND i.mo_no = o.mo_no 
               AND i.size_numcode = o.size_numcode
            ORDER BY 
               COALESCE(i.month, o.month),
               COALESCE(i.mo_no, o.mo_no),
               COALESCE(i.size_numcode, o.size_numcode)
            OPTION (
               OPTIMIZE FOR UNKNOWN,
               RECOMPILE
            );
         `)

		await mongoManager.withTransaction(async (session) => {
			const yearMonth = format(new Date(), 'yyyy-MM')

			await mongoManager.getRepository('mo_inventory_audit').bulkWrite(
				monthlyInOutbound.getRawMany().map((item) => {
					const sizeNumber = new SizeNumber(item.size_numcode).normalize('padleft')

					return {
						updateOne: {
							filter: { mo_no: item.mo_no, year_month: item.year_month },
							update: {
								$setOnInsert: {
									mo_no: item.mo_no,
									year_month: item.year_month
								},
								$set: {
									[`size_ledger.${sizeNumber}.stocked_in_qty`]: item.stocked_in_qty,
									[`size_ledger.${sizeNumber}.shipped_out_qty`]: item.shipped_out_qty
								}
							},
							upsert: true
						}
					}
				}),
				{ session }
			)

			await mongoManager
				.getRepository('mo_inventory_audit')
				.updateMany(
					{ mo_no: { $nin: monthlyInOutbound.getRawMany().map((item) => item.mo_no) } },
					{ deleted: true },
					{ session }
				)

			logger.info('✅ Updated monthly audit data')
		})
	} catch (error) {
		if (error instanceof Error) logger.error(error)
	} finally {
		await mssqlManager.disconnect()
		process.exit(0)
	}
}

main()
