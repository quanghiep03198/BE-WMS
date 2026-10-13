import { FinishedGoodsEpcStatus } from '@modules/finished-goods/domain/constants'
import { chunk } from 'lodash'
import { MongoManager } from './libs/mongoose'
import { MssqlManager } from './libs/mssql'
import { getArgs } from './utils/get-args'
import { Logger } from './utils/logger'

const args = getArgs({
	host: {
		type: 'string',
		short: 'h',
		description: 'MSSQL host',
		default: process.env.DB_HOST
	}
})

async function main() {
	const logger = new Logger('MigrateFinishedGoodsEpcs')

	if (typeof args.host !== 'string') {
		logger.error('MSSQL host is not specified')
		process.exit(1)
	}

	const mssqlManager = new MssqlManager(args.host)
	const mongoManager = new MongoManager()

	try {
		await mssqlManager.connect()
		await mongoManager.connect('gl3_data_warehouse')

		const query = await mssqlManager.query<{
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
		}>(/* SQL */ `
         DECLARE @InboundDeviceSn AS NVARCHAR (50) = 'c6a307dc', @OutboundDeviceSn AS NVARCHAR (50) = '4233521261';

         WITH     epcs_at_101
         AS       (SELECT a.EPC_Code,
                        a.size_code,
                        a.mo_no,
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
                           AND (LEFT(c.mo_no, 2) >= '15'
                                 OR c.mo_no IN ('14C11B078', '14C11B077', '14C03C009'))
                  WHERE  station_suffix = '101'
                        AND a.EPC_Code NOT LIKE 'E28%'
                        AND (LEFT(a.mo_no, 2) >= '15'
                              OR a.mo_no IN ('14C11B078', '14C11B077', '14C03C009'))),
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
                        AND (LEFT(mo_no, 2) >= '15'
                              OR mo_no IN ('14C11B078', '14C11B077', '14C03C009')))
         SELECT   _101.EPC_Code AS epc,
                  _101.size_code AS size_numcode,
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

		const rows = query.getRawMany()

		const chunks = chunk(rows, 1000)

		for (const chunk of chunks) {
			await mongoManager.getRepository('finished_goods_epcs').bulkWrite(
				chunk.map((row) => ({
					updateOne: {
						filter: { epc: row.epc },
						update: { $set: row },
						upsert: true
					}
				}))
			)
		}
		logger.info('Finished goods EPCs migration completed successfully.')
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
