import { SuperJson } from '@/common/utils'
import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { REDIS_CLIENT } from '@/redis/constants'
import { Inject, Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import Redis from 'ioredis'
import { isNil } from 'lodash'
import { PinoLogger } from 'nestjs-pino'
import { CachedResult, DataSource, In, Like } from 'typeorm'
import { CreateRFIDDeviceDTO, DeleteRFIDDeviceDTO, UpdateRFIDDeviceDTO } from '../dto/rfid-device.dto'
import { RFIDReaderEntity } from '../entities/rfid-reader.entity'
import { ExtendedRFIDReaderEntity } from '../types'

@Injectable()
export class RFIDDeviceService {
	private readonly CACHE_KEY_PREFIX = 'cached:devices'
	private readonly CACHE_TTL_SECONDS = 60 * 60 * 24 * 7 // 7 days
	private readonly CACHE_TTL_MILLISECONDS = this.CACHE_TTL_SECONDS * 1000 // 7 days

	constructor(
		@Inject(REDIS_CLIENT) private readonly redisClient: Redis,
		@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly dataSourceDL: DataSource,
		private readonly logger: PinoLogger
	) {}

	private async findActiveDevices() {
		const rfidReaderCacheKeys = await this.redisClient.keys(this.CACHE_KEY_PREFIX + ':*')

		const pipeline = this.redisClient.pipeline()
		rfidReaderCacheKeys.forEach((key) => pipeline.get(key))
		return (await pipeline.exec())
			.flatMap(([error, result]) => {
				if (error) return null
				const parsedCache = SuperJson.parse<CachedResult<ExtendedRFIDReaderEntity>>(result)
				if (!parsedCache) return null
				return parsedCache.result
			})
			.filter((item) => !isNil(item))
	}

	public async createDevice(
		payload: CreateRFIDDeviceDTO & Pick<RFIDReaderEntity, 'user_code_created' | 'factory_code'>
	) {
		// const newDevice = this.dataSourceDL.getRepository(RFIDReaderEntity).create(payload)
		return await this.dataSourceDL.getRepository(RFIDReaderEntity).insert(payload)
	}

	public async updateDevice(deviceSeriesNumber: string, payload: UpdateRFIDDeviceDTO & { user_code_updated: string }) {
		return await this.dataSourceDL.getRepository(RFIDReaderEntity).update({ device_sn: deviceSeriesNumber }, payload)
	}

	public async findAllWarehouseDevices(factoryCode: string) {
		const activeReaders = await this.findActiveDevices()

		const activeReadersQuery = this.dataSourceDL
			.createQueryBuilder()
			.select(/* SQL */ `JSON_VALUE(VALUE, '$.device_sn')`, 'device_sn')
			.addSelect(/* SQL */ `JSON_VALUE(VALUE, '$.last_used_time')`, 'last_used_time')
			.from(/* SQL */ `OPENJSON(N'${SuperJson.stringify(activeReaders)}')`, 'json_data')
			.disableEscaping()

		return await this.dataSourceDL
			.getRepository(RFIDReaderEntity)
			.createQueryBuilder('a')
			.addCommonTableExpression(activeReadersQuery.getQuery(), 'active_readers_cte')
			.select('a.device_sn', 'device_sn')
			.addSelect('a.device_name', 'station_no')
			.addSelect(/* SQL */ `STRING_AGG(a.device_ant, ',')`, 'device_ant')
			.addSelect('a.isactive', 'is_active')
			.addSelect('a.ip_address', 'ip_address')
			.addSelect('a.ip_port', 'ip_port')
			.addSelect('b.last_used_time', 'last_used_time')
			.where(/* SQL */ `a.device_name LIKE 'CUS_${factoryCode}_WH%'`)
			.leftJoin(
				(qb) => qb.select(['device_sn', 'last_used_time']).from('active_readers_cte', 'b'),
				'b',
				/* SQL */ `a.device_sn = b.device_sn`
			)
			.groupBy('a.device_sn')
			.addGroupBy('a.device_name')
			.addGroupBy('a.isactive')
			.addGroupBy('a.ip_address')
			.addGroupBy('a.ip_port')
			.addGroupBy('b.last_used_time')
			.orderBy('a.device_name', 'ASC')
			.disableEscaping()
			.getRawMany<RFIDReaderEntity>()
	}

	public async findOneBySeriesNumber(deviceSeriesNumber: string, station?: string) {
		return await this.dataSourceDL
			.getRepository(RFIDReaderEntity)
			.createQueryBuilder()
			.distinct()
			.select('device_sn', 'device_sn')
			.addSelect('device_name', 'station_no')
			.addSelect(/* SQL */ `STRING_AGG(device_ant, ',')`, 'device_ant')
			.addSelect('isactive', 'is_active')
			.addSelect('ip_address', 'ip_address')
			.addSelect('ip_port', 'ip_port')
			.where({ device_sn: deviceSeriesNumber, ...(station && { station_no: Like('%' + station) }) })
			.groupBy('device_sn')
			.addGroupBy('device_name')
			.addGroupBy('isactive')
			.addGroupBy('ip_address')
			.addGroupBy('ip_port')
			.cache(`${this.CACHE_KEY_PREFIX}:${deviceSeriesNumber}`, this.CACHE_TTL_MILLISECONDS)
			.getRawOne<RFIDReaderEntity>()
	}

	// @OnEvent('rfid.reader.post_data', { async: true })
	// protected async updateLastUsageTime({
	// 	deviceSeriesNumber,
	// 	lastUsageTime
	// }: {
	// 	deviceSeriesNumber: string
	// 	lastUsageTime: string
	// }) {
	// 	try {
	// 		const cacheKey = `${this.CACHE_KEY_PREFIX}:${deviceSeriesNumber}`
	// 		const cachedData = await this.redisClient.get(cacheKey)
	// 		if (isNil(cachedData) || !SuperJson.isValid(cachedData)) return
	// 		const cachedReaderInfo = SuperJson.parse<CachedResult<ExtendedRFIDReaderEntity>>(cachedData)
	// 		await this.redisClient.setex(
	// 			`${this.CACHE_KEY_PREFIX}:${deviceSeriesNumber}`,
	// 			this.CACHE_TTL_SECONDS,
	// 			SuperJson.stringify({
	// 				...cachedReaderInfo,
	// 				result: cachedReaderInfo?.result?.map((item) => ({
	// 					...item,
	// 					last_used_time: lastUsageTime
	// 				}))
	// 			})
	// 		)
	// 	} catch (error) {
	// 		this.logger.error(error)
	// 	}
	// }

	public async deleteDevicesBySeriesNumbers(deviceSeriesNumbers: DeleteRFIDDeviceDTO) {
		return await this.dataSourceDL.getRepository(RFIDReaderEntity).delete({ device_sn: In(deviceSeriesNumbers) })
	}
}
