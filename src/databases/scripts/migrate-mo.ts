import 'dotenv/config'
import { omit } from 'lodash'
import { MongoManager } from '../libs/mongoose'
import { MssqlManager } from '../libs/mssql'
import { Logger } from '../utils/logger'
import { SizeNumber } from '../utils/size-number'

export type TManufacturingOrder = {
	mo_no: string
	mo_totalqty: number
	brand_name: string
	factory_shoes_style: string
	color_sn: string
	size_numcode: string
	factory_code_produce: string
	sizes: Array<{ size_numcode: string; size_qty: number }>
}

async function main() {
	const mssqlManager = new MssqlManager()
	const mongoManager = new MongoManager()
	const logger = new Logger()

	try {
		await mssqlManager.connect()
		await mongoManager.connect()
		const moQuery = await mssqlManager.query<TManufacturingOrder>(
			/* SQL */ `
				WITH mo_size_source AS (
					SELECT
						t.mo_no,
						t.size_code,
						t.size_sumqty,
						REPLACE(
							TRANSLATE(
								UPPER(msr.size_numcode), 
								'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 
								'                          '
							),
								' ',
								''
						) AS size_numcode,
						msr.size_qty
					FROM wuerp_vnrd.dbo.ta_manufactursizerun t
					CROSS APPLY (
					VALUES
						([size_numcode01], [size_qty01]),
						([size_numcode02], [size_qty02]),
						([size_numcode03], [size_qty03]),
						([size_numcode04], [size_qty04]),
						([size_numcode05], [size_qty05]),
						([size_numcode06], [size_qty06]),
						([size_numcode07], [size_qty07]),
						([size_numcode08], [size_qty08]),
						([size_numcode09], [size_qty09]),
						([size_numcode10], [size_qty10]),
						([size_numcode11], [size_qty11]),
						([size_numcode12], [size_qty12]),
						([size_numcode13], [size_qty13]),
						([size_numcode14], [size_qty14]),
						([size_numcode15], [size_qty15]),
						([size_numcode16], [size_qty16]),
						([size_numcode17], [size_qty17]),
						([size_numcode18], [size_qty18]),
						([size_numcode19], [size_qty19]),
						([size_numcode20], [size_qty20]),
						([size_numcode21], [size_qty21]),
						([size_numcode22], [size_qty22]),
						([size_numcode23], [size_qty23]),
						([size_numcode24], [size_qty24]),
						([size_numcode25], [size_qty25]),
						([size_numcode26], [size_qty26]),
						([size_numcode27], [size_qty27]),
						([size_numcode28], [size_qty28]),
						([size_numcode29], [size_qty29]),
						([size_numcode30], [size_qty30]),
						([size_numcode31], [size_qty31]),
						([size_numcode32], [size_qty32]),
						([size_numcode33], [size_qty33]),
						([size_numcode34], [size_qty34]),
						([size_numcode35], [size_qty35]),
						([size_numcode36], [size_qty36]),
						([size_numcode37], [size_qty37]),
						([size_numcode38], [size_qty38]),
						([size_numcode39], [size_qty39]),
						([size_numcode40], [size_qty40])
					) msr ([size_numcode], [size_qty])
					WHERE msr.size_qty > 0
						AND msr.size_numcode IS NOT NULL
				)
				, mo_size_json AS (
					SELECT
						d.mo_no,
						d.size_code,
						MAX(d.size_sumqty) AS size_sumqty,
						CONCAT(
							'[',
							STRING_AGG(
								CONCAT('{',  
									'"size_numcode":', '"',  STRING_ESCAPE(CAST(d.size_numcode AS NVARCHAR(5)), 'json'),  '"',  
									',', 
									'"size_qty":' , CAST(d.size_qty AS INT),  '}'),
								','
							) WITHIN GROUP (ORDER BY TRY_CAST(d.size_numcode AS FLOAT) ASC, d.size_numcode ASC),
							']'
						) AS mo_size_run
					FROM (
						SELECT mo_no, size_code, size_numcode, size_qty, size_sumqty
						FROM mo_size_source
					) d
					GROUP BY d.mo_no, d.size_code
				)
				SELECT 
					a.mo_no AS mo_no,
					a.mo_totalqty AS order_qty,
					a.cofactory_code AS factory_code_produce,
					d.brand_name AS brand_name,
					c.shoestyle_codefactory AS factory_shoes_style,
					CONCAT(c.shoestyle_codecust, '/', c.shoestyle_namecust) AS cust_shoes_style,
					b.color_sn AS color_sn,
					ISNULL(msj.mo_size_run, '[]') AS sizes
				FROM wuerp_vnrd.dbo.ta_manufacturmst a
				LEFT JOIN wuerp_vnrd.dbo.ta_manufacturdet aa ON aa.mo_no = a.mo_no AND aa.isactive = 'Y'
				LEFT JOIN wuerp_vnrd.dbo.ta_productmst b ON b.mat_code= a.mat_code AND b.isactive= 'Y'
				LEFT JOIN wuerp_vnrd.dbo.ta_shoefactorymst c ON c.shoestyle_systemcodefty = b.shoestyle_systemcodefty AND c.isactive = 'Y'
				LEFT JOIN wuerp_vnrd.dbo.ta_brand d ON d.custbrand_id = b.custbrand_id
				LEFT JOIN wuerp_vnrd.dbo.ta_ordermst e ON e.or_no = aa.or_no AND e.isactive = 'Y'
				LEFT JOIN mo_size_json msj ON msj.mo_no = a.mo_no
				WHERE
					LEFT(a.mo_no, 2) >= '13'
					AND d.brand_code IN ('UG','TV','KB')
					AND a.cofactory_code = 'VA1'
					AND aa.mo_noseq = '001'
					AND msj.mo_size_run IS NOT NULL
					AND a.isactive = 'Y'
				ORDER BY a.mo_no;
			`,
			{}
		)

		if (typeof moQuery === 'undefined') {
			logger.info('No manufacturing orders found to sync.')
			process.exit(0)
		}

		const manufacturingOrders = moQuery.getRawMany().map((item) => {
			const mappedItem = {
				...item,
				size_ledger: item.sizes.reduce((acc, curr) => {
					const sizeKey = new SizeNumber(curr.size_numcode).normalize('padleft')
					return {
						...acc,
						[sizeKey]: {
							order_qty: curr.size_qty,
							stocked_in_qty: 0,
							total_recall_tx: 0,
							total_return_tx: 0,
							shipped_out_qty: 0
						}
					}
				}, {})
			}

			return omit(mappedItem, ['sizes'])
		})

		if (manufacturingOrders.length === 0) {
			logger.info('No manufacturing orders found to sync.')
			process.exit(0)
		}

		await mongoManager.getRepository('manufacturing_orders').deleteMany()

		const insertMongoResult = await mongoManager
			.getRepository('manufacturing_orders')
			.insertMany(manufacturingOrders, { ordered: false })

		logger.info(`Inserted ${insertMongoResult.insertedCount} manufacturing orders into MongoDB`)

		const moInventoryVariationQuery = await mssqlManager.query<{
			mo_no: string
			size_code: string
			stocked_in_qty: number
			total_recall_tx: number
			total_return_tx: number
			shipped_out_qty: number
		}>(
			/* SQL */ `
			WITH cte AS (
			SELECT * , 
				ROW_NUMBER() OVER (PARTITION BY EPC_Code, mo_no, rfid_status, station_suffix ORDER BY record_time DESC) AS row_num
			FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily
			),
			ledger AS (
				SELECT mo_no, 
					(SELECT MAX(value) FROM STRING_SPLIT(size_code, '/')) AS size_code, 
					IIF(rfid_status = 'A' AND station_suffix = '101' AND row_num = 1, ABS(SUM(quantity)), 0) AS stocked_in_qty,
					IIF(rfid_status = 'B' AND station_suffix = '101', ABS(SUM(quantity)), 0) AS total_recall_tx,
					IIF(rfid_status = 'A' AND station_suffix = '101' AND row_num > 1, ABS(SUM(quantity)), 0) AS total_return_tx,
					IIF(rfid_status = 'B' AND station_suffix = '103' AND row_num = 1, ABS(SUM(quantity)), 0) AS shipped_out_qty
				FROM cte
				WHERE LEFT(mo_no, 2) >= '13'
					AND ISNUMERIC(TRY_CAST(LEFT(mo_no, 2) AS INT)) = 1
					AND size_code IS NOT NULL
				GROUP BY mo_no, station_suffix, size_code, rfid_status, row_num
			)
			SELECT * FROM ledger
				WHERE stocked_in_qty > 0 OR total_recall_tx > 0 OR total_return_tx > 0 OR shipped_out_qty > 0
			ORDER BY mo_no, size_code
			`,
			{}
		)

		if (!moInventoryVariationQuery) {
			logger.info('No inventory ledger data found to sync.')
			process.exit(0)
		}

		const bulkUpdateResult = await mongoManager.getRepository('manufacturing_orders').bulkWrite(
			moInventoryVariationQuery.getRawMany().map((item) => ({
				updateOne: {
					filter: { mo_no: item.mo_no },
					update: {
						$set: {
							[`size_ledger.${item.size_code}.stocked_in_qty`]: item.stocked_in_qty,
							[`size_ledger.${item.size_code}.total_recall_tx`]: item.total_recall_tx,
							[`size_ledger.${item.size_code}.total_return_tx`]: item.total_return_tx,
							[`size_ledger.${item.size_code}.shipped_out_qty`]: item.shipped_out_qty
						}
					}
				}
			})),
			{ ordered: false }
		)

		logger.info(
			`✅ Updated ${bulkUpdateResult.modifiedCount} manufacturing orders in MongoDB with inventory ledger data`
		)
	} catch (error) {
		if (error instanceof Error) logger.error(error)
		process.exit(1)
	} finally {
		await mssqlManager.disconnect()
		await mongoManager.disconnect()
		process.exit(0)
	}
}

main()

// await mongoManager.getRepository('manufacturing_orders').aggregate([
// 	{
// 		$lookup: {
// 			from: 'finished_goods_epcs',
// 			let: {
// 				mo_no: '$mo_no',
// 				factory_code_produce: '$factory_code_produce',
// 				factory_shoes_style: '$factory_shoes_style',
// 				color_sn: '$color_sn'
// 			},
// 			pipeline: [
// 				{
// 					$match: {
// 						$expr: {
// 							$and: [
// 								{ $eq: ['$mo_no', '$$mo_no'] },
// 								{ $eq: ['$factory_code_produce', '$$factory_code_produce'] },
// 								{ $eq: ['$factory_shoes_style', '$$factory_shoes_style'] },
// 								{ $eq: ['$color_sn', '$$color_sn'] }
// 							]
// 						}
// 					}
// 				},
// 				{
// 					$addFields: {
// 						stocked_in_qty: {
// 							$cond: [{ $eq: [{ $type: '$inbound_at' }, 'date'] }, 1, 0]
// 						},
// 						total_recall_tx: {
// 							$cond: [{ $eq: [{ $type: '$recalled_at' }, 'date'] }, 1, 0]
// 						},
// 						total_return_tx: {
// 							$cond: [{ $eq: [{ $type: '$returned_at' }, 'date'] }, 1, 0]
// 						},
// 						shipped_out_qty: {
// 							$cond: [{ $eq: [{ $type: '$outbound_at' }, 'date'] }, 1, 0]
// 						}
// 					}
// 				},
// 				{
// 					$group: {
// 						_id: '$size_numcode',
// 						stocked_in_qty: { $sum: '$stocked_in_qty' },
// 						total_recall_tx: { $sum: '$total_recall_tx' },
// 						total_return_tx: { $sum: '$total_return_tx' },
// 						shipped_out_qty: { $sum: '$shipped_out_qty' }
// 					}
// 				},
// 				{
// 					$project: {
// 						_id: 0,
// 						size_numcode: '$_id',
// 						stocked_in_qty: 1,
// 						total_recall_tx: 1,
// 						total_return_tx: 1,
// 						shipped_out_qty: 1
// 					}
// 				}
// 			],
// 			as: 'fg_sizes'
// 		}
// 	},
// 	{
// 		$addFields: {
// 			fg_size_map: {
// 				$arrayToObject: {
// 					$map: {
// 						input: '$fg_sizes',
// 						as: 's',
// 						in: {
// 							k: '$$s.size_numcode',
// 							v: {
// 								stocked_in_qty: '$$s.stocked_in_qty',
// 								total_recall_tx: '$$s.total_recall_tx',
// 								total_return_tx: '$$s.total_return_tx',
// 								shipped_out_qty: '$$s.shipped_out_qty'
// 							}
// 						}
// 					}
// 				}
// 			}
// 		}
// 	},
// 	{
// 		$addFields: {
// 			size_ledger: {
// 				$arrayToObject: {
// 					$map: {
// 						input: { $objectToArray: '$size_ledger' },
// 						as: 'entry',
// 						in: {
// 							k: '$$entry.k',
// 							v: {
// 								$mergeObjects: [
// 									'$$entry.v',
// 									{
// 										stocked_in_qty: {
// 											$ifNull: [
// 												{
// 													$getField: {
// 														field: 'stocked_in_qty',
// 														input: {
// 															$ifNull: [
// 																{ $getField: { field: '$$entry.k', input: '$fg_size_map' } },
// 																{}
// 															]
// 														}
// 													}
// 												},
// 												0
// 											]
// 										},
// 										total_recall_tx: {
// 											$ifNull: [
// 												{
// 													$getField: {
// 														field: 'total_recall_tx',
// 														input: {
// 															$ifNull: [
// 																{ $getField: { field: '$$entry.k', input: '$fg_size_map' } },
// 																{}
// 															]
// 														}
// 													}
// 												},
// 												0
// 											]
// 										},
// 										total_return_tx: {
// 											$ifNull: [
// 												{
// 													$getField: {
// 														field: 'total_return_tx',
// 														input: {
// 															$ifNull: [
// 																{ $getField: { field: '$$entry.k', input: '$fg_size_map' } },
// 																{}
// 															]
// 														}
// 													}
// 												},
// 												0
// 											]
// 										},
// 										shipped_out_qty: {
// 											$ifNull: [
// 												{
// 													$getField: {
// 														field: 'shipped_out_qty',
// 														input: {
// 															$ifNull: [
// 																{ $getField: { field: '$$entry.k', input: '$fg_size_map' } },
// 																{}
// 															]
// 														}
// 													}
// 												},
// 												0
// 											]
// 										}
// 									}
// 								]
// 							}
// 						}
// 					}
// 				}
// 			}
// 		}
// 	},
// 	{
// 		$project: {
// 			_id: 0,
// 			mo_no: 1,
// 			factory_code_produce: 1,
// 			factory_shoes_style: 1,
// 			color_sn: 1,
// 			size_ledger: 1
// 		}
// 	},
// 	{
// 		$merge: {
// 			into: 'manufacturing_orders',
// 			on: 'mo_no',
// 			whenMatched: [{ $set: { size_ledger: '$$new.size_ledger' } }],
// 			whenNotMatched: 'discard'
// 		}
// 	}
// ])
