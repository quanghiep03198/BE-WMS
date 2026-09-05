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
import { format } from 'date-fns'
import Redis from 'ioredis'
import { isEqual, omit } from 'lodash'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { ISizeLedgerFluctuation } from '../../../ports/inventory-ledger-mongo.repository.port'
import { IStockTransaction } from '../../../types'
import { GetCurrentShippingTxQuery } from '../impl/get-current-shipping-tx.query'

@QueryHandler(GetCurrentShippingTxQuery)
export class GetCurrentShippingTxHandler implements IQueryHandler<GetCurrentShippingTxQuery> {
	constructor(
		@InjectPinoLogger(GetCurrentShippingTxHandler.name) private readonly logger: PinoLogger,
		@InjectRedisClient() private readonly redisClient: Redis,
		@InjectModel(FinishedGoodsEpc.name, DATA_WAREHOUSE_CONNECTION)
		private readonly finishedGoodsEpcModel: FinishedGoodsEpcModel
	) {}

	public async execute(): Promise<IStockTransaction<'outbound'>[]> {
		const currentStockTx = await this.redisClient.lrange(`transactions:inbound`, 0, -1)

		if (!currentStockTx.length) return []

		const persistedCurrentTx = await this.finishedGoodsEpcModel.aggregate<{
			last_tx: string
			po: string
			mo_no: string
			size_ledger: Record<string, ISizeLedgerFluctuation>
		}>([
			{
				$match: {
					status: FinishedGoodsEpcStatus.SHIPPED,
					$expr: {
						$eq: [
							{ $dateToString: { date: '$last_scanned_at', format: '%Y-%m-%d' } },
							format(new Date(), 'yyyy-MM-dd')
						]
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
			const tx = SuperJson.parse<IStockTransaction<'outbound'>>(item)

			const positivePersistedChanges = persistedCurrentTx
				.filter((item) => item.last_tx === tx.id && item.po === tx.po)
				.map((item) => omit(item, ['last_tx']))

			const isConsistent = positivePersistedChanges.length > 0
			positivePersistedChanges.length === tx.changes.length && isEqual(tx.changes, positivePersistedChanges)

			return { ...tx, can_rollback: isConsistent }
		})
	}
}
