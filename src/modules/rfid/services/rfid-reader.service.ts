import { SuperJson } from '@/common/utils'
import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { REDIS_CLIENT } from '@/redis/constants'
import { Inject, Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { InjectRepository } from '@nestjs/typeorm'
import { format } from 'date-fns'
import Redis from 'ioredis'
import { isNil } from 'lodash'
import { PinoLogger } from 'nestjs-pino'
import { CachedResult, In, Like, Repository } from 'typeorm'
import { RFIDReaderEntity } from '../entities/rfid-reader.entity'

@Injectable()
export class RFIDReaderService {
	private readonly CACHE_KEY_PREFIX = 'cached:devices'
	private readonly CACHE_TTL = 1000 * 60 * 60 * 24 * 7 // 7 days

	constructor(
		@InjectRepository(RFIDReaderEntity, DATA_SOURCE_DATA_LAKE)
		private readonly rfidReaderRepository: Repository<RFIDReaderEntity>,
		@Inject(REDIS_CLIENT) private readonly redisClient: Redis,
		private readonly logger: PinoLogger
	) {}

	public async getWarehouseRFIDDevices(factoryCode: string) {
		const rfidReaderCacheKeys = await this.redisClient.keys(this.CACHE_KEY_PREFIX + ':*')

		const pipeline = this.redisClient.pipeline()
		rfidReaderCacheKeys.forEach((key) => pipeline.get(key))
		const cachedDevices = (await pipeline.exec())
			.flatMap(([error, result]) => {
				if (error) return null
				const parsedCache = SuperJson.parse<CachedResult<RFIDReaderEntity & { last_usage_time: string }>>(result)
				if (!parsedCache) return null
				return parsedCache.result
			})
			.filter((item) => !isNil(item))

		return await this.rfidReaderRepository
			.createQueryBuilder()
			.select(/* SQL */ `DISTINCT device_sn`)
			.addSelect(/* SQL */ `device_name`)
			.addSelect(/* SQL */ `ISNULL(STRING_AGG(device_ant, ','), '0') AS device_ant`)
			.addSelect(/* SQL */ `isactive`, 'is_active')
			.addSelect(/* SQL */ `ip_address`)
			.addSelect(/* SQL */ `ip_port`)
			.addSelect(
				rfidReaderCacheKeys.length === 0
					? null
					: /* SQL */ `(
						SELECT MAX(JSON_VALUE(VALUE, '$.last_usage_time'))
						FROM OPENJSON('${SuperJson.stringify(cachedDevices)}')
						WHERE JSON_VALUE(VALUE, '$.device_sn') = device_sn
					)`,
				'last_usage_time'
			)
			.where(/* SQL */ `device_name LIKE :station_no`, { station_no: `CUS_${factoryCode}_WH%` })
			.groupBy(/* SQL */ `device_name, device_sn, isactive, ip_address, ip_port`)
			.disableEscaping()
			.getRawMany<RFIDReaderEntity>()
	}

	public async getSpecificRFIDDevice(deviceSeriesNumber: string, station?: string) {
		return await this.rfidReaderRepository
			.createQueryBuilder()
			.select('device_sn')
			.addSelect('device_name')
			.addSelect('cofactory_code', 'factory_code')
			.addSelect('isactive', 'is_active')
			.addSelect('ip_address')
			.addSelect('ip_port')
			.addSelect(`'${format(new Date(), 'yyyy-MM-dd HH:mm:ss.SSS')}'`, 'last_usage_time')
			.where({ device_sn: deviceSeriesNumber, ...(station && { station_no: Like('%' + station) }) })
			.limit(1)
			.cache(`${this.CACHE_KEY_PREFIX}:${deviceSeriesNumber}`, this.CACHE_TTL)
			.getRawOne<RFIDReaderEntity>()
	}

	@OnEvent('rfid.reader.post_data', { async: true })
	protected async updateLastUsageTime({
		deviceSeriesNumber,
		lastUsageTime
	}: {
		deviceSeriesNumber: string
		lastUsageTime: string
	}) {
		const cacheKey = `${this.CACHE_KEY_PREFIX}:${deviceSeriesNumber}`
		const cachedData = await this.redisClient.get(cacheKey)
		if (isNil(cachedData) || !SuperJson.isValid(cachedData)) return
		const cachedReaderInfo =
			SuperJson.parse<CachedResult<RFIDReaderEntity & { last_usage_time?: string }>>(cachedData)
		await this.redisClient.setex(
			`${this.CACHE_KEY_PREFIX}:${deviceSeriesNumber}`,
			this.CACHE_TTL / 1000,
			SuperJson.stringify({
				...cachedReaderInfo,
				result: cachedReaderInfo?.result?.map((item) => ({
					...item,
					last_usage_time: lastUsageTime
				}))
			})
		)
	}

	public async deleteMany(deviceSeriesNumbers: string[]) {
		return await this.rfidReaderRepository.delete({ device_sn: In(deviceSeriesNumbers) })
	}
}
