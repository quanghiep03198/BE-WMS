import { Injectable } from '@nestjs/common'

import { InjectRedisClient } from '@redis/decorators'
import Redis from 'ioredis'
import { getCdcEchoKey } from '../utils'

@Injectable()
export class CdcEchoRegistryService {
	constructor(@InjectRedisClient() private readonly redis: Redis) {}

	/**
	 * Gọi TRƯỚC khi Saga ghi vào MSSQL — đánh dấu "sắp có 1 echo với originId này,
	 * đừng xử lý lại". TTL nên đủ lớn hơn CDC capture job latency (thường vài trăm ms
	 * tới vài giây) cộng thêm buffer an toàn.
	 */
	async registerOrigin(
		dataSourceToken: string,
		schema: string,
		sourceName: string,
		originId: string,
		ttlMs = 60_000
	): Promise<void> {
		const key = getCdcEchoKey(dataSourceToken, schema, sourceName, originId)
		await this.redis.set(key, '1', 'PX', ttlMs)
	}

	async consumeIfOrigin(
		dataSourceToken: string,
		schema: string,
		sourceName: string,
		originId: string
	): Promise<boolean> {
		const key = getCdcEchoKey(dataSourceToken, schema, sourceName, originId)
		const deleted = await this.redis.del(key)
		return deleted > 0
	}
}
