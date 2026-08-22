import { CdcHandler } from '@databases/cdc/decorators'
import { CdcChangeContext, ICdcHandler } from '@databases/cdc/types'
import { DATA_SOURCE_DATA_LAKE, DATA_WAREHOUSE_CONNECTION, DATABASE_SCHEMA } from '@databases/constants'
import { FinishedGoodsEpcStatus } from '@modules/finished-goods/domain/constants'
import { SizeNumber } from '@modules/finished-goods/domain/value-objects/size-number.vo'
import { ManufacturingOrder, ManufacturingOrderModel } from '@modules/order/schemas/manufacturing-order.schema'
import { InjectTransactionHost, Transactional, TransactionHost } from '@nestjs-cls/transactional'
import { TransactionalAdapterMongoose } from '@nestjs-cls/transactional-adapter-mongoose'
import { InjectModel } from '@nestjs/mongoose'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { FinishedGoodsEpcMatch, FinishedGoodsEpcMatchModel } from '../persistence/mongodb/schemas/epc-match.schema'
import { FinishedGoodsEpc, FinishedGoodsEpcModel } from '../persistence/mongodb/schemas/finished-goods-epc.schema'
import { PurchaseOrder, PurchaseOrderModel } from '../persistence/mongodb/schemas/purchase-order.schema'

@CdcHandler({
	schema: DATABASE_SCHEMA,
	sourceName: 'dv_rfidmatchmst_cust',
	dataSourceToken: DATA_SOURCE_DATA_LAKE,
	pollIntervalMs: 1000,
	originMarkerColumn: 'sync_id'
})
export class FinishedGoodsEpcMatchCdcHandler implements ICdcHandler {
	constructor(
		@InjectTransactionHost(DATA_WAREHOUSE_CONNECTION)
		private readonly txHost: TransactionHost<TransactionalAdapterMongoose>,
		@InjectPinoLogger(FinishedGoodsEpcMatchCdcHandler.name) private readonly logger: PinoLogger,
		@InjectModel(FinishedGoodsEpcMatch.name, DATA_WAREHOUSE_CONNECTION)
		private readonly finishedGoodsEpcMatchModel: FinishedGoodsEpcMatchModel,
		@InjectModel(FinishedGoodsEpc.name, DATA_WAREHOUSE_CONNECTION)
		private readonly finishedGoodsEpcModel: FinishedGoodsEpcModel,
		@InjectModel(ManufacturingOrder.name, DATA_WAREHOUSE_CONNECTION)
		private readonly manufacturingOrderModel: ManufacturingOrderModel,
		@InjectModel(PurchaseOrder.name, DATA_WAREHOUSE_CONNECTION)
		private readonly purchaseOrderModel: PurchaseOrderModel
	) {}

	@Transactional<TransactionalAdapterMongoose>(DATA_WAREHOUSE_CONNECTION)
	async handle({
		changes
	}: CdcChangeContext<{
		epc: string
		mo_no: string
		mo_no_actual: string
		shoestyle_codefactory: string
		cust_shoestyle: string
		color_sn: string
		factory_code_produce: string
		size_numcode: string
	}>): Promise<void> {
		this.logger.debug(`Handling ${changes.length} changes for dv_rfidmatchmst_cust`)

		for (const change of changes) {
			switch (change.operation) {
				case 'insert': {
					await this.finishedGoodsEpcMatchModel.bulkWrite(
						change.data.map((row) => ({
							updateOne: {
								filter: { epc: row.epc },
								update: {
									$setOnInsert: {
										epc: row.epc,
										mo_no: row.mo_no,
										factory_code_produce: row.factory_code_produce,
										factory_shoes_style: row.shoestyle_codefactory,
										cust_shoes_style: row.cust_shoestyle,
										color_sn: row.color_sn,
										size_numcode: new SizeNumber(row.size_numcode).normalize('padleft')
									}
								},
								upsert: true
							}
						}))
					)
					break
				}
				case 'update': {
					const inventoryFluctuationChanges = await this.finishedGoodsEpcModel.aggregate<{
						old_group: Record<'mo_no' | 'size_numcode', string>
						new_group: Record<'mo_no' | 'size_numcode', string>
						epcs: Array<{ epc: string; status: FinishedGoodsEpcStatus }>
						stocked_in_qty: number
						total_recall_tx: number
						shipped_out_qty: number
					}>([
						{
							$match: {
								epc: { $in: change.data.map((row) => row.epc) },
								status: { $ne: FinishedGoodsEpcStatus.SHIPPED }
							}
						},
						{
							$addFields: {
								input_info: {
									$first: {
										$filter: {
											input: {
												$literal: change.data
											},
											as: 'x',
											cond: { $eq: ['$$x.epc', '$epc'] }
										}
									}
								}
							}
						},
						{
							$group: {
								_id: {
									old_group: {
										mo_no: '$mo_no',
										size_numcode: '$size_numcode'
									},
									new_group: {
										mo_no: '$input_info.mo_no',
										size_numcode: '$input_info.size_numcode'
									}
								},
								shipped_out_qty: {
									$sum: {
										$cond: [{ $eq: ['$status', 'shipped'] }, 1, 0]
									}
								},
								stocked_in_qty: {
									$sum: {
										$cond: [{ $eq: ['$status', 'instock'] }, 1, 0]
									}
								},
								total_recall_tx: {
									$sum: {
										$cond: [{ $eq: ['$status', 'recalled'] }, 1, 0]
									}
								},
								epcs: {
									$addToSet: '$epc'
								}
							}
						},
						{
							$project: {
								_id: 0,
								old_group: '$_id.old_group',
								new_group: '$_id.new_group',
								shipped_out_qty: 1,
								stocked_in_qty: 1,
								total_recall_tx: 1,
								epcs: 1
							}
						},
						{
							$sort: {
								'old_group.mo_no': 1,
								'old_group.size_numcode': 1,
								'new_group.mo_no': 1,
								'new_group.size_numcode': 1
							}
						}
					])

					if (inventoryFluctuationChanges.length === 0) return

					await this.manufacturingOrderModel.bulkWrite(
						inventoryFluctuationChanges.map((change) => ({
							updateOne: {
								filter: { mo_no: change.old_group.mo_no },
								update: {
									$inc: {
										[`size_ledger.${change.old_group.size_numcode}.stocked_in_qty`]: -change.stocked_in_qty,
										[`size_ledger.${change.old_group.size_numcode}.shipped_out_qty`]: -change.shipped_out_qty,
										[`size_ledger.${change.old_group.size_numcode}.total_recall_tx`]: -change.total_recall_tx
									}
								}
							}
						}))
					)

					await this.manufacturingOrderModel.bulkWrite(
						inventoryFluctuationChanges.map((change) => ({
							updateOne: {
								filter: { mo_no: change.new_group.mo_no },
								update: {
									$inc: {
										[`size_ledger.${change.new_group.size_numcode}.stocked_in_qty`]: change.stocked_in_qty,
										[`size_ledger.${change.new_group.size_numcode}.shipped_out_qty`]: change.shipped_out_qty,
										[`size_ledger.${change.new_group.size_numcode}.total_recall_tx`]: change.total_recall_tx
									}
								}
							}
						}))
					)

					await this.finishedGoodsEpcMatchModel.bulkWrite(
						change.data.map((row) => ({
							updateOne: {
								filter: { epc: row.epc },
								update: {
									$set: {
										mo_no: row.mo_no_actual || row.mo_no,
										factory_code_produce: row.factory_code_produce,
										factory_shoes_style: row.shoestyle_codefactory,
										cust_shoes_style: row.cust_shoestyle,
										color_sn: row.color_sn,
										old_mo_no: row.mo_no,
										size_numcode: new SizeNumber(row.size_numcode).normalize('padleft')
									}
								}
							}
						})),
						{ session: this.txHost.tx }
					)

					break
				}
				default: {
					break
				}
			}
		}
	}
}
