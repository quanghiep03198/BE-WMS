import 'dotenv/config'
import { AnyBulkWriteOperation, HydratedDocument } from 'mongoose'
import { env, SuperJson } from '../../common/utils'
import { MongoManager } from './libs/mongoose'
import { MssqlManager } from './libs/mssql'
import { getArgs } from './utils/get-args'
import { Logger } from './utils/logger'

interface IManufacturingOrder {
	mo_no: string
	brand_name: string
	factory_code_produce: string
	factory_shoes_style: string
	cust_shoes_style: string
	color_sn: string
	order_qty: number
	size_ledger: Record<
		string,
		Record<'order_qty' | 'stocked_in_qty' | 'total_recall_tx' | 'total_return_tx' | 'shipped_out_qty', number>
	>
}

type ManufacturingOrderDocument = HydratedDocument<IManufacturingOrder>

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
		description: 'Factory code',
		default: env('APP_TENANCY')
	},
	moPrefix: {
		type: 'string',
		description: 'MO prefix',
		default: '15'
	}
})

async function execute() {
	const logger = new Logger()

	if (typeof args.mssqlHost !== 'string') {
		logger.error('MSSQL host is not specified')
		process.exit(1)
	}

	if (typeof args.mongoDbName !== 'string') {
		logger.error('mongoDbName database name is not specified')
		process.exit(1)
	}

	const mssqlManager = new MssqlManager(args.mssqlHost)
	const mongoManager = new MongoManager(args.mongoDbName)

	let batch: Array<AnyBulkWriteOperation<ManufacturingOrderDocument>> = []
	const BATCH_SIZE = 100
	let totalProcessed = 0
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
				{
					const operations = batch
					batch = []
					const flush = mongoManager
						.getRepository<ManufacturingOrderDocument>('manufacturing_orders')
						.bulkWrite(operations, { ordered: false })
						.then(() => {
							totalProcessed += operations.length
							logger.info(`Synchronized ${totalProcessed} manufacturing orders so far.`)
						})

					pendingFlush = flush

					try {
						await flush
					} catch (error) {
						throw error
					} finally {
						pendingFlush = undefined
					}
				}
			}
		}

		request.on('row', async (row) => {
			batch.push({
				updateOne: {
					filter: { mo_no: row.mo_no },
					update: {
						$set: {
							...row,
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
				logger.info(`Synchronized ${totalProcessed} manufacturing orders.`)
			} catch (error) {
				logger.error('Error during final bulk write: ' + error)
				rejectStream(error)
			}
		})

		const queryPromise = await request.query<IManufacturingOrder>(/* SQL */ `
			DECLARE @FactoryCode NVARCHAR(5) = '${args.tenant}', @MoPrefix NVARCHAR(2) = '${args.moPrefix}';

			-- Order size run
			WITH     target_mo
			AS       (SELECT DISTINCT a.mo_no
						FROM   wuerp_vnrd.dbo.ta_manufacturmst AS a
								INNER JOIN
								wuerp_vnrd.dbo.ta_brand AS b
								ON a.custbrand_id = b.custbrand_id
						WHERE  LEFT(a.mo_no, 2) = @MoPrefix
								AND b.brand_code IN = 'UG'
								AND a.cofactory_code = @FactoryCode
								AND a.isactive = 'Y'
			),
						mo_size_source
			AS       (SELECT t.mo_no,
								t.size_code,
								t.size_sumqty,
								msr.size_numcode,
								msr.size_qty
						FROM   wuerp_vnrd.dbo.ta_manufactursizerun AS t
								INNER JOIN
								target_mo AS tm
								ON tm.mo_no = t.mo_no CROSS APPLY (VALUES ([size_numcode01], [size_qty01]), ([size_numcode02], [size_qty02]), ([size_numcode03], [size_qty03]), ([size_numcode04], [size_qty04]), ([size_numcode05], [size_qty05]), ([size_numcode06], [size_qty06]), ([size_numcode07], [size_qty07]), ([size_numcode08], [size_qty08]), ([size_numcode09], [size_qty09]), ([size_numcode10], [size_qty10]), ([size_numcode11], [size_qty11]), ([size_numcode12], [size_qty12]), ([size_numcode13], [size_qty13]), ([size_numcode14], [size_qty14]), ([size_numcode15], [size_qty15]), ([size_numcode16], [size_qty16]), ([size_numcode17], [size_qty17]), ([size_numcode18], [size_qty18]), ([size_numcode19], [size_qty19]), ([size_numcode20], [size_qty20]), ([size_numcode21], [size_qty21]), ([size_numcode22], [size_qty22]), ([size_numcode23], [size_qty23]), ([size_numcode24], [size_qty24]), ([size_numcode25], [size_qty25]), ([size_numcode26], [size_qty26]), ([size_numcode27], [size_qty27]), ([size_numcode28], [size_qty28]), ([size_numcode29], [size_qty29]), ([size_numcode30], [size_qty30]), ([size_numcode31], [size_qty31]), ([size_numcode32], [size_qty32]), ([size_numcode33], [size_qty33]), ([size_numcode34], [size_qty34]), ([size_numcode35], [size_qty35]), ([size_numcode36], [size_qty36]), ([size_numcode37], [size_qty37]), ([size_numcode38], [size_qty38]), ([size_numcode39], [size_qty39]), ([size_numcode40], [size_qty40])) AS msr([size_numcode], [size_qty])
						WHERE  msr.size_qty > 0
								AND msr.size_numcode IS NOT NULL),
						mo_size_raw
			AS       (SELECT   mo_no,
									size_numcode,
									SUM(size_qty) AS size_qty
						FROM     mo_size_source
						GROUP BY mo_no, size_numcode),
						mo_size_qty
			AS       (SELECT   mo_no,
									size_numcode,
									SUM(size_qty) AS order_qty
						FROM     (SELECT mo_no,
												wuerp_vnrd.dbo.NORMALIZE_SIZE_NUMBER(size_numcode) AS size_numcode,
												size_qty
									FROM   mo_size_raw) AS n
						GROUP BY mo_no, size_numcode),
						all_epcs
			AS       (SELECT EPC_Code,
								a.mo_no,
								station_suffix,
								rfid_status,
								quantity,
								size_code,
								record_time
						FROM   DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet a  WITH (NOLOCK)
						INNER JOIN target_mo b ON a.mo_no = b.mo_no
						UNION
						SELECT EPC_Code,
								a.mo_no,
								station_suffix,
								rfid_status,
								quantity,
								size_code,
								record_time
						FROM   DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet_backup_Daily a  WITH (NOLOCK)
						INNER JOIN target_mo b ON a.mo_no = b.mo_no),
			-- In/outbound progress
						epcs
			AS       (SELECT r.mo_no,
								r.station_suffix,
								r.rfid_status,
								r.quantity,
								r.size_code,
								ROW_NUMBER() OVER (PARTITION BY r.EPC_Code, r.mo_no, r.rfid_status, r.station_suffix ORDER BY r.record_time DESC) AS row_num
						FROM   all_epcs AS r
								INNER JOIN
								target_mo AS tm
								ON tm.mo_no = r.mo_no
						WHERE  ISNUMERIC(TRY_CAST (LEFT(r.mo_no, 2) AS INT)) = 1),
						normalized
			AS       (SELECT e.mo_no,
								e.station_suffix,
								e.rfid_status,
								e.row_num,
								e.quantity,
								s.size_code
						FROM   epcs AS e CROSS APPLY (SELECT MAX(value) AS size_code
																FROM   STRING_SPLIT (e.size_code, '/')) AS s
						WHERE  e.size_code IS NOT NULL),
						detail
			AS       (SELECT   mo_no,
									size_code,
									rfid_status,
									station_suffix,
									row_num,
									ABS(SUM(quantity)) AS qty
						FROM     normalized
						GROUP BY mo_no, size_code, rfid_status, station_suffix, row_num),
						ledger
			AS       (SELECT   mo_no,
									size_code,
									SUM(IIF (rfid_status = 'A'
												AND station_suffix = '101'
												AND row_num = 1, qty, 0)) AS stocked_in_qty,
									SUM(IIF (rfid_status = 'B'
												AND station_suffix = '101', qty, 0)) AS total_recall_tx,
									SUM(IIF (rfid_status = 'A'
												AND station_suffix = '101'
												AND row_num > 1, qty, 0)) AS total_return_tx,
									SUM(IIF (rfid_status = 'B'
												AND station_suffix = '103'
												AND row_num = 1, qty, 0)) AS shipped_out_qty
						FROM     detail
						WHERE    size_code IS NOT NULL
						GROUP BY mo_no, size_code),
						entries
			AS       (SELECT mo_no,
								size_code,
								stocked_in_qty,
								total_recall_tx,
								total_return_tx,
								shipped_out_qty
						FROM   ledger
						WHERE  stocked_in_qty > 0
								OR total_recall_tx > 0
								OR total_return_tx > 0
								OR shipped_out_qty > 0),
						mo_size_merged
			AS       (SELECT COALESCE (q.mo_no, l.mo_no) AS mo_no,
								COALESCE (q.size_numcode, l.size_code) AS size_key,
								ISNULL(q.order_qty, 0) AS order_qty,
								ISNULL(l.stocked_in_qty, 0) AS stocked_in_qty,
								ISNULL(l.total_recall_tx, 0) AS total_recall_tx,
								ISNULL(l.total_return_tx, 0) AS total_return_tx,
								ISNULL(l.shipped_out_qty, 0) AS shipped_out_qty
						FROM   mo_size_qty AS q
								FULL OUTER JOIN
								entries AS l
								ON l.mo_no = q.mo_no
									AND l.size_code = q.size_numcode),
						mo_size_json
			AS       (SELECT   mo_no,
									CONCAT('{', STRING_AGG(CAST (CONCAT('"', STRING_ESCAPE(CAST (size_key AS NVARCHAR (50)), 'json'), '":{"order_qty":', order_qty, ',"stocked_in_qty":', stocked_in_qty, ',"total_recall_tx":', total_recall_tx, ',"total_return_tx":', total_return_tx, ',"shipped_out_qty":', shipped_out_qty, '}') AS NVARCHAR (MAX)), ',') WITHIN GROUP (ORDER BY TRY_CAST (size_key AS FLOAT) ASC, size_key ASC), '}') AS sizes
						FROM     mo_size_merged
						GROUP BY mo_no) -- Main stage
			SELECT   DISTINCT a.mo_no AS mo_no,
									a.mo_totalqty AS order_qty,
									a.cofactory_code AS factory_code_produce,
									d.brand_name AS brand_name,
									c.shoestyle_codefactory AS factory_shoes_style,
									CONCAT(c.shoestyle_codecust, '/', c.shoestyle_namecust) AS cust_shoes_style,
									b.color_sn AS color_sn,
									msj.sizes AS size_ledger
			FROM     wuerp_vnrd.dbo.ta_manufacturmst AS a
						LEFT OUTER JOIN
						wuerp_vnrd.dbo.ta_productmst AS b
						ON b.mat_code = a.mat_code
							AND b.isactive = 'Y'
						LEFT OUTER JOIN
						wuerp_vnrd.dbo.ta_shoefactorymst AS c
						ON c.shoestyle_systemcodefty = b.shoestyle_systemcodefty
							AND c.isactive = 'Y'
						LEFT OUTER JOIN
						wuerp_vnrd.dbo.ta_brand AS d
						ON d.custbrand_id = b.custbrand_id
						LEFT OUTER JOIN
						mo_size_json AS msj
						ON msj.mo_no = a.mo_no
			WHERE    LEFT(a.mo_no, 2) = @MoPrefix
						AND d.brand_code = 'UG'
						AND a.cofactory_code = @FactoryCode
						AND msj.sizes IS NOT NULL
						AND a.isactive = 'Y'
			ORDER BY a.mo_no
			OPTION (OPTIMIZE FOR UNKNOWN, MAXDOP 8, FAST 100);
			`)

		await Promise.all([queryPromise, streamCompletion])
	} catch (error) {
		logger.error(error)
		process.exit(1)
	} finally {
		await mssqlManager.disconnect()
		await mongoManager.disconnect()
		process.exit(0)
	}
}

execute()

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
