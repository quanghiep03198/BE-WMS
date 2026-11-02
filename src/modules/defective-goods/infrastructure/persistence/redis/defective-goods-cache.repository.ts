import { generateCacheKey } from '@common/helpers/generate-cache-key.helper'
import { IDefectiveGoodsCacheRepository } from '@modules/defective-goods/application/ports/defective-goods-cache.port'
import { IDefectiveGoodsProps } from '@modules/defective-goods/domain/models/defective-goods.model'
import { Injectable } from '@nestjs/common'
import { InjectRedisClient } from '@redis/decorators'
import { Redis } from 'ioredis'

@Injectable()
export class DefectiveGoodsCacheRepository implements IDefectiveGoodsCacheRepository {
	constructor(@InjectRedisClient() private readonly redis: Redis) {}

	async setCount(filter: Partial<IDefectiveGoodsProps>, count: number) {
		const key = generateCacheKey(filter)
		await this.redis.set(`cached:total:defective_goods:${key}`, count, 'EX', 60)
		return count
	}

	async getCount(filter: Partial<IDefectiveGoodsProps>) {
		const key = generateCacheKey(filter)
		const count = await this.redis.get(`cached:total:defective_goods:${key}`)
		return count ? Number.parseInt(count, 10) : 0
	}
}
