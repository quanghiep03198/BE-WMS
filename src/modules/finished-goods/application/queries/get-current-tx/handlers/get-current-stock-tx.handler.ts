import { SuperJson } from '@common/utils'
import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import {
	FinishedGoodsEpc,
	FinishedGoodsEpcModel
} from '@modules/finished-goods/infrastructure/persistence/mongodb/schemas/finished-goods-epc.schema'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectModel } from '@nestjs/mongoose'
import { InjectRedisClient } from '@redis/decorators'
import Redis from 'ioredis'
import isEqual from 'lodash/isEqual'
import pick from 'lodash/pick'
import { ISizeLedgerFluctuation } from '../../../ports/inventory-ledger.repository.port'
import { IInoutboundTransaction, StockTxType } from '../../../types'
import { GetCurrentStockTxQuery } from '../impl/get-current-stock-tx.query'

@QueryHandler(GetCurrentStockTxQuery)
export class GetCurrentStockTxHandler implements IQueryHandler<GetCurrentStockTxQuery> {
	constructor(
		@InjectRedisClient() private readonly redisClient: Redis,
		@InjectModel(FinishedGoodsEpc.name, DATA_WAREHOUSE_CONNECTION)
		private readonly finishedGoodsEpcModel: FinishedGoodsEpcModel
	) {}

	public async execute(): Promise<IInoutboundTransaction<'inbound'>[]> {
		const currentStockTx = await this.redisClient.lrange(`transactions:inbound`, 0, -1)
		const from = new Date()
		from.setHours(0, 0, 0, 0)
		const to = new Date()
		to.setHours(23, 59, 59, 999)

		const start = performance.now()

		const persistedCurrentTx = await this.finishedGoodsEpcModel.aggregate<{
			id: string
			tx_type: StockTxType
			mo_no: string
			changes: Record<string, ISizeLedgerFluctuation>
		}>([
			{
				$match: {
					scannable: true,
					deleted: false,
					status: { $in: ['instock', 'recalled'] },
					inbound_times: { $gte: 1 },
					$or: [
						{
							status: 'instock',
							inbound_at: {
								$gte: from,
								$lt: to
							}
						},
						{
							status: 'recalled',
							recalled_at: {
								$gte: from,
								$lt: to
							}
						}
					]
				}
			},
			{
				$addFields: {
					tx_type: {
						$cond: [{ $eq: ['$status', 'instock'] }, 'stock_in', 'recall']
					}
				}
			},
			{
				$group: {
					_id: {
						last_tx: '$last_tx',
						mo_no: '$mo_no',
						size_numcode: '$size_numcode',
						tx_type: '$tx_type'
					},
					stocked_in_qty: {
						$sum: {
							$cond: [
								{
									$and: [{ $eq: ['$status', 'instock'] }, { $eq: ['$inbound_times', 1] }]
								},
								1,
								0
							]
						}
					},
					total_recall_tx: {
						$sum: {
							$cond: [{ $eq: ['$status', 'recalled'] }, 1, 0]
						}
					},
					total_return_tx: {
						$sum: {
							$cond: [
								{
									$and: [{ $eq: ['$status', 'instock'] }, { $gt: ['$inbound_times', 1] }]
								},
								1,
								0
							]
						}
					}
				}
			},
			{
				$group: {
					_id: {
						last_tx: '$_id.last_tx',
						tx_type: '$_id.tx_type',
						mo_no: '$_id.mo_no'
					},
					size_ledger: {
						$push: {
							k: '$_id.size_numcode',
							v: {
								stocked_in_qty: '$stocked_in_qty',
								total_recall_tx: '$total_recall_tx',
								total_return_tx: '$total_return_tx'
							}
						}
					}
				}
			},
			{
				$project: {
					_id: 0,
					id: '$_id.last_tx',
					tx_type: '$_id.tx_type',
					mo_no: '$_id.mo_no',
					changes: { $arrayToObject: '$size_ledger' }
				}
			}
		])

		const end = performance.now()
		console.log(`Query execution time: ${end - start} ms`)

		const persistedCurrentTxMap = new Map(persistedCurrentTx.map((item) => [item.id, item]))

		return currentStockTx.map((item) => {
			const tx = SuperJson.parse<IInoutboundTransaction<'inbound'>>(item)

			const isConsistent =
				persistedCurrentTxMap.has(tx.id) &&
				isEqual(persistedCurrentTxMap.get(tx.id), pick(tx, ['id', 'tx_type', 'mo_no', 'changes']))

			return { ...tx, reversible: isConsistent }
		})
	}
}
