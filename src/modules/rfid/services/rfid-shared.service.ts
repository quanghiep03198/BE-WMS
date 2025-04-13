import { DATA_SOURCE_DATA_LAKE, MAIN_DATA_SOURCE } from '@/databases/constants'
import { Inject, Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { readFileSync } from 'fs'
import { throttle } from 'lodash'
import { AnyBulkWriteOperation } from 'mongoose'
import { join, resolve } from 'path'
import { DataSource } from 'typeorm'
import { EXCLUDED_EPC_PATTERN, EXCLUDED_ORDERS, FALLBACK_VALUE } from '../constants'
import { PostReaderDataDTO } from '../dto/rfid.dto'
import { RFIDReaderEntity } from '../entities/rfid-reader.entity'
import { EpcModel, EpcSchema } from '../schemas/epc.schema'
import { StoredRFIDReaderItem } from '../types'

@Injectable()
export class RFIDSharedService {
	private readonly epcInformationQuery: string = readFileSync(
		resolve(join(__dirname, '../sql/epc-information.sql')),
		'utf-8'
	)

	constructor(
		@Inject(MAIN_DATA_SOURCE) private readonly dataSource: DataSource,
		@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly dataSourceDL: DataSource
	) {}

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

	public async bulkWriteRFIDData(model: EpcModel, { data, sn }: PostReaderDataDTO) {
		// * Get the RFID reader information from the database
		const deviceInformation = await this.dataSourceDL.getRepository(RFIDReaderEntity).findOneBy({ device_sn: sn })

		/**
		 * * Get the EPCs information from the database with received data
		 * * Do not receive EPCs that start with '303429' (Dansko's EPCs)
		 */
		const epcList = data.tagList.map((item) => item.epc.trim()).join(',')
		const excludedOrderList = EXCLUDED_ORDERS.join(',')
		const stationNO = deviceInformation?.station_no ?? FALLBACK_VALUE
		const incommingEpcs = await this.dataSourceDL.query<StoredRFIDReaderItem[]>(this.epcInformationQuery, [
			FALLBACK_VALUE,
			epcList,
			EXCLUDED_EPC_PATTERN,
			excludedOrderList
		])

		if (incommingEpcs.length === 0) return

		const bulkWriteOptions: AnyBulkWriteOperation<EpcSchema>[] = incommingEpcs.map((item) => ({
			updateOne: {
				filter: { epc: item.epc, scannable: true },
				update: { ...item, station_no: stationNO, record_time: new Date(), deleted: false },
				upsert: true
			}
		}))
		await model.bulkWrite(bulkWriteOptions, {
			writeConcern: { w: 'majority' },
			ordered: false,
			retryWrites: true,
			timestamps: true
		})
	}
}
