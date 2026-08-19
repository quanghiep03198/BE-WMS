import { Injectable } from '@nestjs/common'

import { InjectRedisClient } from '@redis/decorators'
import Redis from 'ioredis'
import { getCdcEchoKey } from '../utils'

@Injectable()
export class CdcEchoRegistryService {
	constructor(@InjectRedisClient() private readonly redis: Redis) {}

	/**
	 * @description Registers an origin in the CDC echo registry with a specified time-to-live (TTL).
	 * @param dataSourceToken
	 * @param schema
	 * @param sourceName
	 * @param originId
	 * @param ttlMs
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
