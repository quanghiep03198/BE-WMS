import 'dotenv/config'
import mssql from 'mssql'
import { MongoManager } from './libs/mongoose'
import { MssqlManager } from './libs/mssql'
import { getArgs } from './utils/get-args'
import { Logger } from './utils/logger'

const args = getArgs({ po: { type: 'string' }, date: { type: 'string' } })

async function main() {
	const logger = new Logger('Reset Test Data')
	if (!args.po) {
		logger.error('Missing required argument: --po <purchase_order>')
		process.exit(1)
	}

	const mssqlManager = new MssqlManager()
	const mongoManager = new MongoManager()

	await mssqlManager.connect()
	await mongoManager.connect()

	try {
		await mssqlManager.query(/* SQL */ `DELETE FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet WHERE po = @po`, {
			po: { type: mssql.NVarChar(9), value: args.po }
		})

		await mongoManager.withTransaction(async (session) => {
			// * Reset manufacturing_orders in MongoDB
			// const masterInventoryVariations = await mongoManager
			// 	.getRepository('finished_goods_epc')
			// 	.aggregate(
			// 		[
			// 			{ $match: { po: args.po } },
			// 			{
			// 				$group: {
			// 					_id: {
			// 						mo_no: '$mo_no',
			// 						factory_code_produce: '$factory_code_produce',
			// 						factory_shoes_style: '$factory_shoes_style',
			// 						color_sn: '$color_sn',
			// 						size_numcode: '$size_numcode'
			// 					},
			// 					po: { $first: '$po' }
			// 				}
			// 			},
			// 			{
			// 				$group: {
			// 					_id: {
			// 						mo_no: '$_id.mo_no',
			// 						factory_code_produce: '$_id.factory_code_produce',
			// 						factory_shoes_style: '$_id.factory_shoes_style',
			// 						color_sn: '$_id.color_sn'
			// 					},
			// 					po: { $first: '$po' },
			// 					size_ledger: {
			// 						$push: {
			// 							k: '$_id.size_numcode',
			// 							v: {
			// 								shipped_out_qty: {
			// 									$literal: 0
			// 								}
			// 							}
			// 						}
			// 					}
			// 				}
			// 			},
			// 			{
			// 				$project: {
			// 					_id: 0,
			// 					mo_no: '$_id.mo_no',
			// 					po: 1,
			// 					factory_code_produce: '$_id.factory_code_produce',
			// 					factory_shoes_style: '$_id.factory_shoes_style',
			// 					color_sn: '$_id.color_sn',
			// 					size_ledger: { $arrayToObject: '$size_ledger' }
			// 				}
			// 			}
			// 		],
			// 		{ session }
			// 	)
			// 	.toArray()

			// await mongoManager.getRepository('manufacturing_orders').bulkWrite(
			// 	masterInventoryVariations.map((item) => ({
			// 		updateOne: {
			// 			filter: { mo_no: item.mo_no },
			// 			update: { $set: { inventory_variation: item.inventory_variation } }
			// 		}
			// 	})),
			// 	{ session }
			// )

			// * Reset daily_po_shipping_progress in MongoDB

			// if (args.date)
			// 	await mongoManager
			// 		.getRepository('daily_po_shipping_progress')
			// 		.deleteOne({ po: args.po, date: args.date }, { session })
			// else await mongoManager.getRepository('daily_po_shipping_progress').deleteMany({ po: args.po }, { session })

			// * Reset finished_goods_epcs in MongoDB
			// await mongoManager.getRepository('finished_goods_epcs').updateMany(
			// 	{ po: args.po },
			// 	{
			// 		$set: { status: 'scanning', scannable: true },
			// 		$unset: {
			// 			outbound_at: undefined,
			// 			po: undefined
			// 		}
			// 	},
			// 	{ session }
			// )

			// * Reset purchase_orders in MongoDB
			const [{ shipping_progress: shippingProgress }] = await mongoManager
				.getRepository('purchase_orders')
				.aggregate(
					[
						{
							$match: { po: args.po }
						},
						{
							$project: {
								_id: 0,
								po: 1,
								shipping_progress: {
									$arrayToObject: {
										$map: {
											input: {
												$objectToArray: '$shipping_progress'
											},
											as: 'size',
											in: {
												k: '$$size.k',
												v: {
													order_qty: '$$size.v.order_qty',
													shipped_out_qty: {
														$literal: 0
													}
												}
											}
										}
									}
								}
							}
						}
					],
					{ session }
				)
				.toArray()

			await mongoManager
				.getRepository('purchase_orders')
				.updateOne({ po: args.po }, { $set: { shipping_progress: shippingProgress } }, { session })

			// await mongoManager.getRepository('mo_inventory_audit').bulkWrite(
			// 	masterInventoryVariations.map((item) => ({
			// 		updateOne: {
			// 			filter: { mo_no: item.mo_no },
			// 			update: {
			// 				$set: pickBy(
			// 					flatten({ inventory_variation: item.inventory_variation }) as Record<
			// 						string,
			// 						{ shipped_out_qty: number }
			// 					>,
			// 					(_, k) => k.endsWith('shipped_out_qty')
			// 				)
			// 			}
			// 		}
			// 	})),
			// 	{ session }
			// )

			logger.info('✅ Test data reset completed successfully.')
		})
	} catch (error) {
		if (error instanceof Error) logger.error(error)
	} finally {
		await mssqlManager.disconnect()
		process.exit(0)
	}
}

main()
