import { MAIN_DATA_SOURCE } from '@/databases/constants'
import { Inject, Injectable } from '@nestjs/common'
import { throttle } from 'lodash'
import { DataSource } from 'typeorm'
import { RFIDReaderEntity } from '../entities/rfid-reader.entity'
import { EpcModel } from '../schemas/epc.schema'

@Injectable()
export class RFIDSharedService {
	constructor(@Inject(MAIN_DATA_SOURCE) private readonly dataSource: DataSource) {}

	/**
	 *
	 * @param model
	 * @param onSnapshot
	 * @returns {mongodb.ChangeStream<ResultType, ChangeType>}
	 */
	public captureDataChange(model: EpcModel, onSnapshot: (change?: any) => unknown): ReturnType<typeof model.watch> {
		const changeStream = model.watch(
			[
				{
					$match: {
						operationType: {
							$in: ['insert', 'update', 'delete']
						}
					}
				}
			],
			{
				fullDocument: 'updateLookup',
				readPreference: 'nearest'
			}
		)

		changeStream.on('change', throttle(onSnapshot, 500))

		return changeStream
	}

	public async getWarehouseRFIDDevices(factoryCode: string) {
		return await this.dataSource
			.getRepository(RFIDReaderEntity)
			.createQueryBuilder()
			.select(/* SQL */ `DISTINCT device_sn`)
			.addSelect(/* SQL */ `device_name`)
			.addSelect(/* SQL */ `ISNULL(STRING_AGG(device_ant, ','), '0') AS device_ant`)
			.addSelect(/* SQL */ `isactive AS is_active`)
			.where(/* SQL */ `device_name LIKE :station_no`, { station_no: `CUS_${factoryCode}_WH10%` })
			.groupBy(/* SQL */ `device_name, device_sn, isactive, CONCAT(ip_address, ':', ip_port)`)
			.getRawMany()
	}
}
