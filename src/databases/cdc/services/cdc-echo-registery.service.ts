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

	/**
	 * @description Batch version of `consumeIfOrigin`: consumes many origin markers in one Redis pipeline.
	 * @returns The set of origin ids that were registered (i.e. rows that are echoes of our own writes)
	 */
	async consumeManyIfOrigin(
		dataSourceToken: string,
		schema: string,
		sourceName: string,
		originIds: string[]
	): Promise<Set<string>> {
		const uniqueIds = [...new Set(originIds)]
		if (uniqueIds.length === 0) return new Set()

		const pipeline = this.redis.pipeline()
		for (const originId of uniqueIds) {
			pipeline.del(getCdcEchoKey(dataSourceToken, schema, sourceName, originId))
		}

		const results = await pipeline.exec()
		if (!results) return new Set()

		const echoes = new Set<string>()
		results.forEach(([error, deleted], index) => {
			if (error) throw error // lỗi Redis: để lượt poll thất bại và thử lại, không coi nhầm là "không phải echo"
			if ((deleted as number) > 0) echoes.add(uniqueIds[index])
		})
		return echoes
	}
}
