import { MongoManager } from './libs/mongoose'
import { MssqlManager } from './libs/mssql'
import { getArgs } from './utils/get-args'
import { Logger } from './utils/logger'

const args = getArgs({
	host: {
		type: 'string'
	}
})

async function main() {
	const logger = new Logger('MigrateProductSpecification')

	if (typeof args.host !== 'string') {
		logger.error('Host argument is missing or invalid')
		process.exit(1)
	}

	const mssqlManager = new MssqlManager(args.host)
	const mongoManager = new MongoManager()

	try {
		await mssqlManager.connect()
		await mongoManager.connect()

		const query = await mssqlManager.query<{
			brand_name: string
			factory_shoes_style: string
			cust_shoes_style: string
			product_variants: Array<{ color_sn: string; sizes: Array<Record<'size_numcode', string>> }>
		}>(/* SQL */ `
			SELECT   DISTINCT brand_name,
                  CAST (ISNULL(shoestyle_codecust, '') + '/' + ISNULL(shoestyle_namecust, '') AS NVARCHAR (255)) AS cust_shoes_style,
                  shoestyle_codefactory AS factory_shoes_style,
                  JSON_QUERY(cl.product_variants) AS product_variants
         FROM     wuerp_vnrd.dbo.ta_shoefactorymst AS a
                  INNER JOIN
                  wuerp_vnrd.dbo.ta_productmst AS b
                  ON a.shoestyle_systemcodefty = b.shoestyle_systemcodefty
                     AND b.isactive = 'Y'
                     AND b.color_sn IS NOT NULL
                  INNER JOIN
                  wuerp_vnrd.dbo.ta_brand AS c
                  ON c.isactive = 'Y'
                     AND c.custbrand_id = b.custbrand_id
                  CROSS APPLY (SELECT (SELECT DISTINCT b.color_sn,
                                                      JSON_QUERY(s.sizes) AS sizes
                                       FROM   wuerp_vnrd.dbo.ta_productmst AS c
                                             CROSS APPLY (SELECT (SELECT DISTINCT wuerp_vnrd.dbo.NORMALIZE_SIZE_NUMBER(sz.size_numcode) AS size_numcode
                                                                  FROM   wuerp_vnrd.dbo.ta_productmst AS p
                                                                        INNER JOIN
                                                                        wuerp_vnrd.dbo.ta_manufacturmst AS m
                                                                        ON p.mat_code = m.mat_code
                                                                           AND m.isactive = 'Y'
                                                                        INNER JOIN
                                                                        wuerp_vnrd.dbo.ta_manufacturdet AS md
                                                                        ON md.mo_no = m.mo_no
                                                                           AND md.isactive = 'Y'
                                                                        INNER JOIN
                                                                        wuerp_vnrd.dbo.ta_ordersizerun AS os
                                                                        ON os.or_no = md.or_no
                                                                           AND os.isactive = 'Y'
                                                                        OUTER APPLY (VALUES ([size_numcode01], [size_qty01] - [size_qtycancel01]), ([size_numcode02], [size_qty02] - [size_qtycancel02]), ([size_numcode03], [size_qty03] - [size_qtycancel03]), ([size_numcode04], [size_qty04] - [size_qtycancel04]), ([size_numcode05], [size_qty05] - [size_qtycancel05]), ([size_numcode06], [size_qty06] - [size_qtycancel06]), ([size_numcode07], [size_qty07] - [size_qtycancel07]), ([size_numcode08], [size_qty08] - [size_qtycancel08]), ([size_numcode09], [size_qty09] - [size_qtycancel09]), ([size_numcode10], [size_qty10] - [size_qtycancel10]), ([size_numcode11], [size_qty11] - [size_qtycancel11]), ([size_numcode12], [size_qty12] - [size_qtycancel12]), ([size_numcode13], [size_qty13] - [size_qtycancel13]), ([size_numcode14], [size_qty14] - [size_qtycancel14]), ([size_numcode15], [size_qty15] - [size_qtycancel15]), ([size_numcode16], [size_qty16] - [size_qtycancel16]), ([size_numcode17], [size_qty17] - [size_qtycancel17]), ([size_numcode18], [size_qty18] - [size_qtycancel18]), ([size_numcode19], [size_qty19] - [size_qtycancel19]), ([size_numcode20], [size_qty20] - [size_qtycancel20]), ([size_numcode21], [size_qty21] - [size_qtycancel21]), ([size_numcode22], [size_qty22] - [size_qtycancel22]), ([size_numcode23], [size_qty23] - [size_qtycancel23]), ([size_numcode24], [size_qty24] - [size_qtycancel24]), ([size_numcode25], [size_qty25] - [size_qtycancel25]), ([size_numcode26], [size_qty26] - [size_qtycancel26]), ([size_numcode27], [size_qty27] - [size_qtycancel27]), ([size_numcode28], [size_qty28] - [size_qtycancel28]), ([size_numcode29], [size_qty29] - [size_qtycancel29]), ([size_numcode30], [size_qty30] - [size_qtycancel30]), ([size_numcode31], [size_qty31] - [size_qtycancel31]), ([size_numcode32], [size_qty32] - [size_qtycancel32]), ([size_numcode33], [size_qty33] - [size_qtycancel33]), ([size_numcode34], [size_qty34] - [size_qtycancel34]), ([size_numcode35], [size_qty35] - [size_qtycancel35]), ([size_numcode36], [size_qty36] - [size_qtycancel36]), ([size_numcode37], [size_qty37] - [size_qtycancel37]), ([size_numcode38], [size_qty38] - [size_qtycancel38]), ([size_numcode39], [size_qty39] - [size_qtycancel39]), ([size_numcode40], [size_qty40] - [size_qtycancel40])) AS sz([size_numcode], [size_qty])
                                                                  WHERE  p.color_sn = b.color_sn
                                                                        AND sz.size_numcode IS NOT NULL
                                                                        AND sz.size_qty > 0
                                                                        AND p.shoestyle_systemcodefty = a.shoestyle_systemcodefty
                                                                        AND m.created >= CAST (DATEADD(YEAR, -1, GETDATE()) AS DATE)
                                                                  FOR    JSON PATH) AS sizes) AS s(sizes)
                                       WHERE  b.shoestyle_systemcodefty = a.shoestyle_systemcodefty
                                             AND s.sizes IS NOT NULL
                                       FOR    JSON PATH) AS product_variants) AS cl(product_variants)
         WHERE    a.isactive = 'Y'
                  AND cl.product_variants IS NOT NULL
                  AND shoestyle_codecust IS NOT NULL
                  AND -- AND (a.created >= CAST(DATEADD(DAY, -7, GETDATE()) AS DATE) OR a.updated >= CAST(DATEADD(DAY, -7, GETDATE()) AS DATE))
                  c.brand_code IN ('UG', 'TV', 'KB')
         ORDER BY brand_name ASC;
			`)

		const data = query.getRawMany()

		await mongoManager.withTransaction(async (session) => {
			await mongoManager.getRepository('product_specifications').deleteMany({}, { session })
			await mongoManager.getRepository('product_specifications').bulkWrite(
				data.map((spec) => ({
					updateOne: {
						filter: {
							brand_name: spec.brand_name,
							factory_shoes_style: spec.factory_shoes_style,
							cust_shoes_style: spec.cust_shoes_style
						},
						update: [
							{
								$set: {
									brand_name: spec.brand_name,
									factory_shoes_style: spec.factory_shoes_style,
									cust_shoes_style: spec.cust_shoes_style,
									product_variants: spec.product_variants.map((variant) => ({
										...variant,
										sizes: variant.sizes.map((sz) => sz.size_numcode)
									}))
								}
							}
						],
						upsert: true
					}
				})),
				{ session }
			)
		})
		logger.info('Product specifications migrated successfully.')
	} catch (error) {
		logger.error(error)
		process.exit(1)
	} finally {
		await mssqlManager.disconnect()
		await mongoManager.disconnect()
		process.exit(0)
	}
}

main()
