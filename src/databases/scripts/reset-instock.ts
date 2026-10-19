import 'dotenv/config'
import { omit } from 'lodash'
import mssql from 'mssql'

import { format } from 'date-fns'
import { MongoManager } from './libs/mongoose'
import { MssqlManager } from './libs/mssql'
import { getArgs } from './utils/get-args'
import { Logger } from './utils/logger'

const args = getArgs({ mongoDbName: { type: 'string' }, mo: { type: 'string' } })

async function main() {
	const logger = new Logger()

	if (!args.mongoDbName) {
		logger.error('Missing required argument: --mongoDbName <mongo_db_name>')
		process.exit(1)
	}

	if (!args.mo) {
		logger.error('Missing required argument: --mo <mo_number>')
		process.exit(1)
	}

	const mssqlManager = new MssqlManager()
	const mongoManager = new MongoManager(args.mongoDbName)

	await mssqlManager.connect()
	await mongoManager.connect()

	try {
		await mssqlManager.query(
			/* SQL */ `DELETE FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet WHERE mo_no = @mo_no AND RIGHT(stationNO, 3) = '101'`,
			{
				mo_no: { type: mssql.NVarChar(9), value: args.mo }
			}
		)

		await mongoManager.withTransaction(async (session) => {
			const [{ size_ledger: masterInventoryVariation }] = await mongoManager
				.getRepository('manufacturing_orders')
				.aggregate<{
					mo_no: string
					size_ledger: Record<string, { order_qty: number; stocked_in_qty: number; shipped_out_qty: number }>
				}>(
					[
						{
							$match: { mo_no: args.mo }
						},
						{
							$project: {
								_id: 0,
								mo_no: 1,
								size_ledger: {
									$arrayToObject: {
										$map: {
											input: {
												$objectToArray: '$size_ledger'
											},
											as: 'size',
											in: {
												k: '$$size.k',

												v: {
													order_qty: '$$size.v.order_qty',

													stocked_in_qty: {
														$literal: 0
													},

													total_recall_tx: {
														$literal: 0
													},

													total_return_tx: {
														$literal: 0
													},

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

			await mongoManager.getRepository('manufacturing_orders').updateOne(
				{ mo_no: args.mo },
				{
					$set: { size_ledger: masterInventoryVariation }
				},
				{ session }
			)

			await mongoManager.getRepository('mo_inventory_audit').updateOne(
				{ mo_no: args.mo, month: format(new Date(), 'yyyy-MM') },
				{
					$set: {
						storage_locations: [],
						...Object.entries(masterInventoryVariation).reduce(
							(acc, [size, variation]) => ({
								...acc,
								[`size_ledger.${size}.stocked_in_qty`]: variation.stocked_in_qty,
								[`size_ledger.${size}.shipped_out_qty`]: variation.shipped_out_qty
							}),
							{}
						)
					}
				},
				{ session }
			)

			const dailyInventoryVariation: any = {}
			for (const size in masterInventoryVariation) {
				dailyInventoryVariation[size] = omit(masterInventoryVariation[size], 'order_qty')
			}

			await mongoManager.getRepository('daily_mo_inventory_ledger').deleteMany({ mo_no: args.mo }, { session })
			await mongoManager.getRepository('finished_goods_epcs').updateMany(
				{ mo_no: args.mo },
				{
					$set: { status: 'scanning', inbound_times: 0, scannable: true, deleted: false },
					$unset: {
						inbound_at: undefined,
						outbound_at: undefined,
						recalled_at: undefined,
						returned_at: undefined,
						storage_location: undefined,
						assembly_line: undefined,
						outbound_device_sn: undefined,
						po: undefined
					}
				},
				{ session }
			)

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
