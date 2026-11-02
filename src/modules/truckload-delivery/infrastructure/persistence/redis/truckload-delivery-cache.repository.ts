import { generateCacheKey } from '@common/helpers/generate-cache-key.helper'
import { IDefectiveGoodsProps } from '@modules/defective-goods/domain/models/defective-goods.model'
import { Injectable } from '@nestjs/common'
import { InjectRedisClient } from '@redis/decorators'
import { Redis } from 'ioredis'

@Injectable()
export class TruckloadDeliveryCacheRepository {
	constructor(@InjectRedisClient() private readonly redis: Redis) {}

	async getCount(filter: Partial<IDefectiveGoodsProps>) {
		const key = generateCacheKey(filter)
		const count = await this.redis.get(`cached:total:dispatch_order:${key}`)
		return count ? Number.parseInt(count, 10) : 0
	}

	async setCount(filter: Partial<IDefectiveGoodsProps>, count: number) {
		const key = generateCacheKey(filter)
		await this.redis.set(`cached:total:dispatch_order:${key}`, count, 'EX', 60)
		return count
	}
}
