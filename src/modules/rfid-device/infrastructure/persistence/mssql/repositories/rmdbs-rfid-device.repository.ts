import { DATA_SOURCE_DATA_LAKE } from '@databases/constants'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { RFIDDeviceEntity } from '../entities/rfid-device.entity'

@Injectable()
export class RmdbsRFIDDeviceRepository {
	constructor(
		@InjectRepository(RFIDDeviceEntity, DATA_SOURCE_DATA_LAKE)
		private readonly rfidDeviceRepository: Repository<RFIDDeviceEntity>
	) {}

	public async insertOne(payload: Partial<RFIDDeviceEntity>) {
		return await this.rfidDeviceRepository.insert(payload)
	}

	public async updateOneByDeviceSn(deviceSn: string, payload: Partial<RFIDDeviceEntity>) {
		return await this.rfidDeviceRepository.update({ device_sn: deviceSn }, payload)
	}

	public async deleteManyByDeviceSns(deviceSns: string[]) {
		return await this.rfidDeviceRepository.delete({ device_sn: In(deviceSns) })
	}
}
