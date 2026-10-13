import omit from 'lodash/omit'
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

interface IPurchaseOrder {
	po: string
	mo_no: string
	order_qty: number
	brand_name: string
	factory_shoes_style: string
	cust_shoes_style: string
	color_sn: string
	shipping_destination: string
	shipping_method: string
	shipping_progress: Array<{
		size_numcode: string
		order_qty: number
		shipped_out_qty: number
	}>
}

export async function main() {
	const logger = new Logger()

	if (typeof args.host !== 'string' || !args.host) {
		logger.error('MSSQL host is required')
		process.exit(1)
	}

	const mssqlManager = new MssqlManager(args.host)
	const mongoManager = new MongoManager()

	try {
		await mssqlManager.connect()
		await mongoManager.connect()

		const purchaseOrderQuery = await mssqlManager.query<IPurchaseOrder>(
			/* SQL */ `
         WITH     CTE
         AS       (SELECT a.po,
                        a.po_totalqty AS order_qty,
                        a.ship_type AS shipping_method,
                        a.destCountry AS shipping_destination,
                        a.brand AS brand_name,
                        c.mo_no,
                        a.shoestyle_codefactory AS factory_shoes_style,
                        CONCAT(a.shoestyle_codecust, '/', a.shoestyle_namecust) AS cust_shoes_style,
                        a.color_sn,
                        a.XF_Date,
                        wuerp_vnrd.dbo.NORMALIZE_SIZE_NUMBER(sr.size_numcode) AS size_numcode,
                        sr.size_qty,
                        ROW_NUMBER() OVER (PARTITION BY a.po ORDER BY a.keyid DESC) AS row_num
                  FROM   DV_DATA_LAKE.dbo.dv_OrderProcessR05 AS a
                        INNER JOIN
                        wuerp_vnrd.dbo.ta_ordermst AS b
                        ON a.po = IIF (ISNULL(b.or_custpoone, '') = '', b.or_custpo, b.or_custpoone)
                        INNER JOIN
                        wuerp_vnrd.dbo.ta_manufacturdet AS c
                        ON c.or_no = b.or_no
                        INNER JOIN
                        wuerp_vnrd.dbo.ta_ordersizerun AS d
                        ON d.or_no = b.or_no CROSS APPLY (VALUES ([size_numcode01], [size_qty01] - [size_qtycancel01]), ([size_numcode02], [size_qty02] - [size_qtycancel02]), ([size_numcode03], [size_qty03] - [size_qtycancel03]), ([size_numcode04], [size_qty04] - [size_qtycancel04]), ([size_numcode05], [size_qty05] - [size_qtycancel05]), ([size_numcode06], [size_qty06] - [size_qtycancel06]), ([size_numcode07], [size_qty07] - [size_qtycancel07]), ([size_numcode08], [size_qty08] - [size_qtycancel08]), ([size_numcode09], [size_qty09] - [size_qtycancel09]), ([size_numcode10], [size_qty10] - [size_qtycancel10]), ([size_numcode11], [size_qty11] - [size_qtycancel11]), ([size_numcode12], [size_qty12] - [size_qtycancel12]), ([size_numcode13], [size_qty13] - [size_qtycancel13]), ([size_numcode14], [size_qty14] - [size_qtycancel14]), ([size_numcode15], [size_qty15] - [size_qtycancel15]), ([size_numcode16], [size_qty16] - [size_qtycancel16]), ([size_numcode17], [size_qty17] - [size_qtycancel17]), ([size_numcode18], [size_qty18] - [size_qtycancel18]), ([size_numcode19], [size_qty19] - [size_qtycancel19]), ([size_numcode20], [size_qty20] - [size_qtycancel20]), ([size_numcode21], [size_qty21] - [size_qtycancel21]), ([size_numcode22], [size_qty22] - [size_qtycancel22]), ([size_numcode23], [size_qty23] - [size_qtycancel23]), ([size_numcode24], [size_qty24] - [size_qtycancel24]), ([size_numcode25], [size_qty25] - [size_qtycancel25]), ([size_numcode26], [size_qty26] - [size_qtycancel26]), ([size_numcode27], [size_qty27] - [size_qtycancel27]), ([size_numcode28], [size_qty28] - [size_qtycancel28]), ([size_numcode29], [size_qty29] - [size_qtycancel29]), ([size_numcode30], [size_qty30] - [size_qtycancel30]), ([size_numcode31], [size_qty31] - [size_qtycancel31]), ([size_numcode32], [size_qty32] - [size_qtycancel32]), ([size_numcode33], [size_qty33] - [size_qtycancel33]), ([size_numcode34], [size_qty34] - [size_qtycancel34]), ([size_numcode35], [size_qty35] - [size_qtycancel35]), ([size_numcode36], [size_qty36] - [size_qtycancel36]), ([size_numcode37], [size_qty37] - [size_qtycancel37]), ([size_numcode38], [size_qty38] - [size_qtycancel38]), ([size_numcode39], [size_qty39] - [size_qtycancel39]), ([size_numcode40], [size_qty40] - [size_qtycancel40])) AS sr([size_numcode], [size_qty])
                  WHERE  sr.size_qty > 0
                        AND a.active = 'Y')
         SELECT   po,
                  mo_no,
                  order_qty,
                  shipping_method,
                  shipping_destination,
                  brand_name,
                  factory_shoes_style,
                  cust_shoes_style,
                  color_sn,
                  CONCAT('[', STRING_AGG(CAST (CONCAT('{"size_numcode":"', size_numcode, '", "order_qty":', size_qty, ',"shipped_out_qty":', IIF (XF_Date IS NOT NULL, size_qty, 0), '}') AS NVARCHAR (MAX)), ','), ']') AS shipping_progress
         FROM     CTE
         GROUP BY po, mo_no, order_qty, shipping_method, shipping_destination, brand_name, factory_shoes_style, cust_shoes_style, color_sn;
         `,
			{}
		)

		const shippedOutQty = await mssqlManager.query<{
			po: string
			size_code: string
			shipped_out_qty: number
		}>(/* SQL */ `
         WITH     cte
         AS       (SELECT *,
                        ROW_NUMBER() OVER (PARTITION BY EPC_Code, po, rfid_status, station_suffix ORDER BY record_time DESC) AS row_num
                  FROM   DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily
                  WHERE  po IS NOT NULL
                        AND station_suffix = '103'
                        AND rfid_status = 'B'),
                  progress
         AS       (SELECT   po,
                           (SELECT MAX(value)
                           FROM   STRING_SPLIT (size_code, '/')) AS size_code,
                           ABS(SUM(quantity)) AS shipped_out_qty
                  FROM     cte
                  WHERE    LEFT(mo_no, 2) >= '13'
                           AND ISNUMERIC(TRY_CAST (LEFT(mo_no, 2) AS INT)) = 1
                           AND po IS NOT NULL
                           AND size_code IS NOT NULL
                           AND row_num = 1
                  GROUP BY po, station_suffix, size_code, rfid_status, row_num)
         SELECT   *
         FROM     progress
         WHERE    shipped_out_qty > 0
         ORDER BY po, size_code;
         `)

		const shippedQtyMap = shippedOutQty.getRawMany().reduce(
			(acc, curr) => {
				// const sizeNumber = new SizeNumber(curr.size_code).normalize('padleft')
				if (!acc[curr.po]) {
					acc[curr.po] = {}
				}
				acc[curr.po][curr.size_code] = curr.shipped_out_qty
				return acc
			},
			{} as Record<string, Record<string, number>>
		)

		const purchaseOrders = purchaseOrderQuery.getRawMany().map((item) => omit(item, ['size_run']))

		await mongoManager.withTransaction(async (session) => {
			await mongoManager.getRepository('purchase_orders').deleteMany({}, { session })

			const bulkOperations = purchaseOrders.map((item) => {
				const shippingProgress = Array.isArray(item.shipping_progress)
					? item.shipping_progress.reduce((acc, curr) => {
							return { ...acc, [curr.size_numcode]: curr.order_qty }
						}, {})
					: {}

				const incrementExpression = Array.isArray(item.shipping_progress)
					? {
							$inc: {
								...item.shipping_progress.reduce(
									(acc, curr) => ({
										...acc,
										[`shipping_progress.${curr.size_numcode}.order_qty`]: curr.order_qty,
										[`shipping_progress.${curr.size_numcode}.shipped_out_qty`]: curr.shipped_out_qty
									}),
									{}
								)
							}
						}
					: {}

				return {
					updateOne: {
						filter: { po: item.po },
						update: {
							...incrementExpression,
							$setOnInsert: {
								brand_name: item.brand_name,
								factory_shoes_style: item.factory_shoes_style,
								cust_shoes_style: item.cust_shoes_style,
								color_sn: item.color_sn,
								order_qty: item.order_qty,
								shipping_method:
									typeof item.shipping_method === 'string'
										? item.shipping_method.toUpperCase()
										: item.shipping_method,
								shipping_destination:
									typeof item.shipping_destination === 'string'
										? item.shipping_destination.toUpperCase()
										: item.shipping_destination
							},
							$set: { [`packing.${item.mo_no}`]: shippingProgress }
						},
						upsert: true
					}
				}
			})

			const result = await mongoManager
				.getRepository('purchase_orders')
				.bulkWrite(bulkOperations, { session, ordered: false })

			logger.info(`✅ Inserted ${result.insertedCount} purchase orders`)
		})
	} catch (error) {
		logger.error(error as Error)
		process.exit(1)
	} finally {
		await mssqlManager.disconnect()
		await mongoManager.disconnect()
		process.exit(1)
	}
}

main()
