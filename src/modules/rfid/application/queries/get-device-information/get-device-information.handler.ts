import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { RFIDReaderEntity } from '@/modules/rfid/infrastructure/persistence/mssql/rfid-reader.entity'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { GetDeviceInformationQuery } from './get-device-information.query'

@QueryHandler(GetDeviceInformationQuery)
export class GetDeviceInformationQueryHandler implements IQueryHandler<GetDeviceInformationQuery> {
	private readonly CACHE_KEY_PREFIX: string = 'cached:devices'
	private readonly CACHE_TTL_MILLISECONDS = 60 * 60 * 1000 * 24 * 7 // 7 days

	constructor(@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly dataSourceDL: DataSource) {}

	public async execute({ deviceSerialNumber }: GetDeviceInformationQuery) {
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
			.addSelect(/* SQL */ `FORMAT(GETDATE(), 'yyyy-MM-dd HH:mm:ss.fff')`, 'last_used_time') // Current time as last used time
			.where({ device_sn: deviceSerialNumber })
			.groupBy('device_sn')
			.addGroupBy('device_name')
			.addGroupBy('isactive')
			.addGroupBy('ip_address')
			.addGroupBy('ip_port')
			.cache(`${this.CACHE_KEY_PREFIX}:${deviceSerialNumber}`, this.CACHE_TTL_MILLISECONDS)
			.getRawOne<RFIDReaderEntity>()
	}
}
