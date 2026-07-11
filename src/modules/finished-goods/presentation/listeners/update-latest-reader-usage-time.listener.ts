import { IListener } from '@common/interfaces/listener.interface'
import { SuperJson } from '@common/utils'
import { ExtendedRFIDReaderEntity } from '@modules/rfid-device/types'
import { Injectable } from '@nestjs/common'
import { InjectRedisClient } from '@redis/decorators'
import Redis from 'ioredis'
import { isNil } from 'lodash'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { CachedResult } from 'typeorm'

@Injectable()
export class UpdateLatestReaderUsageTimeListener implements IListener<
	{
		deviceSeriesNumber: string
		lastUsageTime: string
	},
	Promise<void>
> {
	constructor(
		@InjectPinoLogger(UpdateLatestReaderUsageTimeListener.name) private readonly logger: PinoLogger,
		@InjectRedisClient() private readonly redisClient: Redis
	) {}

	async handle({
		deviceSeriesNumber,
		lastUsageTime
	}: {
		deviceSeriesNumber: string
		lastUsageTime: string
	}): Promise<void> {
		const CACHE_KEY_PREFIX: Readonly<string> = 'cached:devices'
		const CACHE_TTL_SECONDS: Readonly<number> = 60 * 60 * 24 * 7 // 7 days

		try {
			const cacheKey = `${CACHE_KEY_PREFIX}:${deviceSeriesNumber}`
			const cachedData = await this.redisClient.get(cacheKey)
			if (isNil(cachedData) || !SuperJson.isValid(cachedData)) return
			const cachedReaderInfo = SuperJson.parse<CachedResult<ExtendedRFIDReaderEntity>>(cachedData)
			if (!Array.isArray(cachedReaderInfo?.result)) return
			await this.redisClient.setex(
				`${CACHE_KEY_PREFIX}:${deviceSeriesNumber}`,
				CACHE_TTL_SECONDS,
				SuperJson.stringify(
					{
						...cachedReaderInfo,
						result: cachedReaderInfo?.result?.map?.((item) => ({
							...item,
							last_used_time: lastUsageTime
						}))
					},
					1
				)
			)
		} catch (error) {
			this.logger.error(error)
		}
	}
}
