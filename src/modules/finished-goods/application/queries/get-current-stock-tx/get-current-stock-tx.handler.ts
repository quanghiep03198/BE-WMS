import { SuperJson } from '@common/utils'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRedisClient } from '@redis/decorators'
import Redis from 'ioredis'
import { orderBy } from 'lodash'

import { IStockTransaction } from '../../types'
import { GetCurrentStockTxQuery } from './get-current-stock-tx.query'

@QueryHandler(GetCurrentStockTxQuery)
export class GetCurrentStockTxHandler implements IQueryHandler<GetCurrentStockTxQuery> {
	constructor(@InjectRedisClient() private readonly redisClient: Redis) {}

	public async execute({ stockFlow }: GetCurrentStockTxQuery): Promise<IStockTransaction<typeof stockFlow>[]> {
		const currentStockInTx = await this.redisClient.lrange(`transactions:${stockFlow}`, 0, -1)
		return orderBy(
			currentStockInTx.map((item) => SuperJson.parse<IStockTransaction<typeof stockFlow>>(item)),
			(item) => item.tx_at,
			'desc'
		)
	}
}
