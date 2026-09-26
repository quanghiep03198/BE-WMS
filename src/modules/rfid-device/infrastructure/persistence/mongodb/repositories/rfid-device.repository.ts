import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { BaseMongoRepository } from '@modules/_base/repositories/base-mongo.abstract.repository'
import { IRFIDDeviceRepository } from '@modules/rfid-device/application/ports/rfid-device.repository.port'
import { IRFIDDevice } from '@modules/rfid-device/domain/interfaces/rfid-device.interface'
import {
	RFIDDevice,
	type RFIDDeviceDocument,
	type RFIDDeviceModel
} from '@modules/rfid-device/infrastructure/persistence/mongodb/schemas/rfid-device.schema'
import { ConflictException, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import type { Types } from 'mongoose'
import { I18nContext, I18nService } from 'nestjs-i18n'

@Injectable()
export class RFIDDeviceRepository extends BaseMongoRepository<RFIDDeviceDocument> implements IRFIDDeviceRepository {
	constructor(
		@InjectModel(RFIDDevice.name, DATA_WAREHOUSE_CONNECTION) private readonly rfidDeviceModel: RFIDDeviceModel,
		private readonly i18nService: I18nService
	) {
		super(rfidDeviceModel)
	}

	public async findOneByDeviceSn(deviceSn: string): Promise<IRFIDDevice | null> {
		return await this.rfidDeviceModel.findOne({ device_sn: deviceSn }).lean({ virtuals: true })
	}

	public override async createOne(
		payload: Partial<RFIDDeviceDocument> | Partial<Omit<IRFIDDevice, '_id' | 'id'>>
	): Promise<RFIDDeviceDocument> {
		const existedDevice = await this.rfidDeviceModel.exists({ device_sn: payload.device_sn })
		if (existedDevice)
			throw new ConflictException(
				this.i18nService.t('rfid_device.errors.device_sn_conflict', { lang: I18nContext.current()?.lang })
			)

		return await super.createOne(payload as Partial<RFIDDeviceDocument>)
	}

	public async findOneAndUpdate(
		id: Types.ObjectId,
		payload: Partial<IRFIDDevice>
	): Promise<{ prev: IRFIDDevice; update: IRFIDDevice }> {
		const existed = await this.rfidDeviceModel.findById(id)
		if (!existed) throw new Error(`RFID device with id ${id.toString()} was not found`)

		const prev = existed.toObject<IRFIDDevice>()
		Object.assign(existed, payload)
		await existed.save()
		return { prev, update: existed.toObject<IRFIDDevice>() }
	}

	public async updateLastUsedAt(deviceSn: string, lastUsedAt: Date): Promise<void> {
		await this.rfidDeviceModel.updateOne({ device_sn: deviceSn }, { last_used_at: lastUsedAt })
	}

	public async deleteMany(ids: string[] | Types.ObjectId[]): Promise<string[]> {
		const pendingDeletedDevices = await this.rfidDeviceModel.find({ _id: { $in: ids } })
		await super.deleteManyByIds(pendingDeletedDevices.map((device) => device._id))
		return pendingDeletedDevices.map((device) => device.device_sn)
	}
}
