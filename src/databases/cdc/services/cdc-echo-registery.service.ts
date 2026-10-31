import { Injectable } from '@nestjs/common'
import { InjectRedisClient } from '@redis/decorators'
import Redis from 'ioredis'
import { getCdcEchoKey } from '../utils'

/**
 * Marker phải sống lâu hơn độ trễ CDC lớn nhất (thời gian capture của SQL Server + thời gian xả backlog).
 * Hết hạn sớm hơn thì dòng echo không còn được nhận ra và bị ghi ngược lại vào Mongo như thay đổi thật.
 */
const DEFAULT_ECHO_TTL_MS = 10 * 60_000

/** Số lệnh tối đa mỗi lần exec pipeline. */
const PIPELINE_CHUNK_SIZE = 5000

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
		ttlMs = DEFAULT_ECHO_TTL_MS
	): Promise<void> {
		const key = getCdcEchoKey(dataSourceToken, schema, sourceName, originId)
		await this.redis.set(key, '1', 'PX', ttlMs)
	}

	/**
	 * @description Batch version of `registerOrigin`. Gọi MỘT lần cho mỗi lô TRƯỚC khi ghi lô đó vào MSSQL,
	 * nếu không CDC có thể đọc thấy dòng trước khi marker kịp tồn tại.
	 */
	async registerOrigins(
		dataSourceToken: string,
		schema: string,
		sourceName: string,
		originIds: string[],
		ttlMs = DEFAULT_ECHO_TTL_MS
	): Promise<void> {
		const ids = [...new Set(originIds)]
		for (let i = 0; i < ids.length; i += PIPELINE_CHUNK_SIZE) {
			const pipeline = this.redis.pipeline()
			for (const originId of ids.slice(i, i + PIPELINE_CHUNK_SIZE)) {
				pipeline.set(getCdcEchoKey(dataSourceToken, schema, sourceName, originId), '1', 'PX', ttlMs)
			}
			await this.execOrThrow(pipeline)
		}
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
	 * @description Batch version of `consumeIfOrigin`: consumes many origin markers through Redis pipelines.
	 * @returns The set of origin ids that had a marker (i.e. rows that are echoes of our own writes).
	 * Lỗi Redis được ném ra để lượt poll thất bại và thử lại, không coi nhầm dòng là "không phải echo".
	 */
	async consumeManyIfOrigin(
		dataSourceToken: string,
		schema: string,
		sourceName: string,
		originIds: string[]
	): Promise<Set<string>> {
		const ids = [...new Set(originIds)]
		const echoes = new Set<string>()

		for (let i = 0; i < ids.length; i += PIPELINE_CHUNK_SIZE) {
			const part = ids.slice(i, i + PIPELINE_CHUNK_SIZE)
			const pipeline = this.redis.pipeline()
			for (const originId of part) {
				pipeline.del(getCdcEchoKey(dataSourceToken, schema, sourceName, originId))
			}

			const results = await this.execOrThrow(pipeline)
			results.forEach((deleted, index) => {
				if ((deleted as number) > 0) echoes.add(part[index])
			})
		}
		return echoes
	}

	private async execOrThrow(pipeline: ReturnType<Redis['pipeline']>): Promise<unknown[]> {
		const results = await pipeline.exec()
		if (!results) return []
		return results.map(([error, value]) => {
			if (error) throw error
			return value
		})
	}
}
