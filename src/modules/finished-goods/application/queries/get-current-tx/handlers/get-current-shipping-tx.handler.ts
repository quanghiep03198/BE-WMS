import { SuperJson } from '@common/utils'
import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { FinishedGoodsEpcStatus } from '@modules/finished-goods/domain/constants'
import {
	FinishedGoodsEpc,
	FinishedGoodsEpcModel
} from '@modules/finished-goods/infrastructure/persistence/mongodb/schemas/finished-goods-epc.schema'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectModel } from '@nestjs/mongoose'
import { InjectRedisClient } from '@redis/decorators'
import Redis from 'ioredis'
import { isEqual } from 'lodash'
import pick from 'lodash/pick'
import { ISizeLedgerFluctuation } from '../../../ports/inventory-ledger.repository.port'
import { IInoutboundTransaction } from '../../../types'
import { GetCurrentShippingTxQuery } from '../impl/get-current-shipping-tx.query'

@QueryHandler(GetCurrentShippingTxQuery)
export class GetCurrentShippingTxHandler implements IQueryHandler<GetCurrentShippingTxQuery> {
	constructor(
		@InjectRedisClient() private readonly redisClient: Redis,
		@InjectModel(FinishedGoodsEpc.name, DATA_WAREHOUSE_CONNECTION)
		private readonly finishedGoodsEpcModel: FinishedGoodsEpcModel
	) {}

	public async execute(): Promise<IInoutboundTransaction<'outbound'>[]> {
		const currentStockTx = await this.redisClient.lrange(`transactions:outbound`, 0, -1)

		if (!currentStockTx.length) return []

		const from = new Date()
		const to = new Date()
		from.setHours(0, 0, 0, 0)
		to.setHours(23, 59, 59, 999)

		const persistedCurrentTx = await this.finishedGoodsEpcModel.aggregate<{
			last_tx: string
			po: string
			mo_no: string
			size_ledger: Record<string, ISizeLedgerFluctuation>
		}>([
			{
				$match: {
					scannable: false,
					deleted: false,
					status: FinishedGoodsEpcStatus.SHIPPED,
					outbound_at: {
						$gte: from,
						$lte: to
					}
				}
			},
			{
				$group: {
					_id: {
						last_tx: '$last_tx',
						mo_no: '$mo_no',
						po: '$po',
						size_numcode: '$size_numcode'
					},
					shipped_out_qty: {
						$sum: {
							$cond: [{ $eq: ['$status', 'shipped'] }, 1, 0]
						}
					}
				}
			},
			{
				$group: {
					_id: {
						last_tx: '$_id.last_tx',
						po: '$_id.po',
						mo_no: '$_id.mo_no'
					},
					size_ledger: {
						$push: {
							k: '$_id.size_numcode',
							v: {
								shipped_out_qty: '$shipped_out_qty'
							}
						}
					}
				}
			},
			{
				$project: {
					_id: 0,
					last_tx: '$_id.last_tx',
					po: '$_id.po',
					mo_no: '$_id.mo_no',
					size_ledger: {
						$arrayToObject: '$size_ledger'
					}
				}
			}
		])

		return currentStockTx.map((item) => {
			const tx = SuperJson.parse<IInoutboundTransaction<'outbound'>>(item)

			const positivePersistedChanges = persistedCurrentTx
				.filter((item) => item.last_tx === tx.id && item.po === tx.po)
				.map((item) => pick(item, ['mo_no', 'size_ledger']))

			const isConsistent =
				positivePersistedChanges.length > 0 &&
				positivePersistedChanges.length === tx.changes.length &&
				isEqual(tx.changes, positivePersistedChanges)

			return { ...tx, reversible: isConsistent }
		})
	}
}
