import { SuperJson } from '@common/utils'
import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { ExtendedRFIDReaderEntity } from '@modules/rfid-device/types'
import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { InjectModel } from '@nestjs/mongoose'
import { InjectRedisClient } from '@redis/decorators'
import Redis from 'ioredis'
import { isNil } from 'lodash'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { CachedResult } from 'typeorm'
import {
	FinishedGoodsEpc,
	FinishedGoodsEpcModel
} from '../../infrastructure/persistence/mongodb/schemas/finished-goods-epc.schema'
import { PostReaderDataDTO } from '../dto/rfid-shared.dto'
import { InoutboundGateway } from '../gateways/inoutbound.gateway'

@Injectable()
export class RFIDListener {
	constructor(
		@InjectModel(FinishedGoodsEpc.name, DATA_WAREHOUSE_CONNECTION)
		private readonly finishedGoodsEpcModel: FinishedGoodsEpcModel,
		@InjectPinoLogger(RFIDListener.name) private readonly logger: PinoLogger,
		@InjectRedisClient() private readonly redisClient: Redis,

		private readonly eventGateway: InoutboundGateway
	) {}

	@OnEvent('rfid.inbound.check', { async: true })
	public async handleCheckRescannedEpcs(payload: PostReaderDataDTO) {
		const epcs = payload.data?.tagList?.map((item) => item.epc.trim()) || []
		const rescannedEpcs = await this.finishedGoodsEpcModel
			.find({ epc: { $in: epcs }, inbound_at: { $ne: null } })
			.lean()

		if (rescannedEpcs.length > 0) {
			this.eventGateway.server.emit(
				'rfid.inbound.check',
				rescannedEpcs.map((item) => item.epc)
			)
		}
	}

	@OnEvent('rfid.reader.post_data', { async: true, suppressErrors: true })
	public async updateLastUsageTime({
		deviceSeriesNumber,
		lastUsageTime
	}: {
		deviceSeriesNumber: string
		lastUsageTime: string
	}) {
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
