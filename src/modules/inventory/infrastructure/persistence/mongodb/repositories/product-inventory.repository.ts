import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { ManufacturingOrder, ManufacturingOrderModel } from '@modules/order/schemas/manufacturing-order.schema'
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'

@Injectable()
export class ProductInventoryRepository {
	constructor(
		@InjectModel(ManufacturingOrder.name, DATA_WAREHOUSE_CONNECTION)
		private readonly manufacturingOrderModel: ManufacturingOrderModel
	) {}

	public async getProductInventory() {}

	private async getIncompleteManufacturingOrders(queries: Record<string, any>) {
		return await this.manufacturingOrderModel.aggregate([
			{
				$set: {
					size_ledger_kv: {
						$objectToArray: { $ifNull: ['$size_ledger', {}] }
					}
				}
			},
			{
				$set: {
					matched_size_ledger_kv: {
						$filter: {
							input: '$size_ledger_kv',
							as: 'item',
							cond: {
								$gt: [
									{
										$subtract: [
											{
												$add: [
													{ $ifNull: ['$$item.v.stocked_in_qty', 0] },
													{ $ifNull: ['$$item.v.total_return_tx', 0] }
												]
											},
											{
												$add: [
													{ $ifNull: ['$$item.v.total_recall_tx', 0] },
													{ $ifNull: ['$$item.v.shipped_out_tx', 0] }
												]
											}
										]
									},
									0
								]
							}
						}
					}
				}
			},
			{
				$match: {
					'matched_size_ledger_kv.0': { $exists: true }
				}
			},
			{
				$project: {
					size_ledger: {
						$arrayToObject: '$matched_size_ledger_kv'
					},
					size_ledger_kv: 0,
					matched_size_ledger_kv: 0
				}
			}
		])
	}
}
