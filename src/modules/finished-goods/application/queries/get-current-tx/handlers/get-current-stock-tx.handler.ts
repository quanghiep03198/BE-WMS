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
import { flatten } from 'flat'
import Redis from 'ioredis'
import { isEqual, omitBy } from 'lodash'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { ISizeLedgerFluctuation } from '../../../ports/inventory-ledger-mongo.repository.port'
import { IStockTransaction } from '../../../types'
import { GetCurrentStockTxQuery } from '../impl/get-current-stock-tx.query'

@QueryHandler(GetCurrentStockTxQuery)
export class GetCurrentStockTxHandler implements IQueryHandler<GetCurrentStockTxQuery> {
	constructor(
		@InjectPinoLogger(GetCurrentStockTxHandler.name) private readonly logger: PinoLogger,
		@InjectRedisClient() private readonly redisClient: Redis,
		@InjectModel(FinishedGoodsEpc.name, DATA_WAREHOUSE_CONNECTION)
		private readonly finishedGoodsEpcModel: FinishedGoodsEpcModel
	) {}

	public async execute(): Promise<IStockTransaction<'inbound'>[]> {
		const currentStockTx = await this.redisClient.lrange(`transactions:inbound`, 0, -1)

		const persistedCurrentTx = await this.finishedGoodsEpcModel.aggregate<{
			last_tx: string
			mo_no: string
			changes: Record<string, ISizeLedgerFluctuation>
		}>([
			{
				$match: {
					status: { $in: [FinishedGoodsEpcStatus.IN_STOCK, FinishedGoodsEpcStatus.RECALLED] },
					inbound_times: { $gte: 1 },
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
						size_numcode: '$size_numcode'
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
					last_tx: '$_id.last_tx',
					mo_no: '$_id.mo_no',
					changes: {
						$arrayToObject: '$size_ledger'
					}
				}
			}
		])

		const persistedCurrentTxMap = new Map(persistedCurrentTx.map((item) => [item.last_tx, item]))

		return currentStockTx.map((item) => {
			const tx = SuperJson.parse<IStockTransaction<'inbound'>>(item)

			const cachedPositiveChanges = omitBy(
				flatten<Record<string, ISizeLedgerFluctuation>, Record<string, number>>(tx?.changes),
				(value) => value === 0
			)

			const positivePersistedChanges = omitBy(
				flatten<Record<string, ISizeLedgerFluctuation>, Record<string, number>>(
					persistedCurrentTxMap.get(tx.id)?.changes ?? {}
				),
				(value) => value === 0
			)

			const isConsistent =
				persistedCurrentTxMap.has(tx.id) && isEqual(cachedPositiveChanges, positivePersistedChanges)

			return { ...tx, can_rollback: isConsistent }
		})
	}
}
