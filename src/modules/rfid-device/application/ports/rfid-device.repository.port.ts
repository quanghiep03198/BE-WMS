import { IBaseRepository } from '@modules/_base/interfaces/base.abstract.repository.interface'
import { IRFIDDevice } from '@modules/rfid-device/domain/interfaces/rfid-device.interface'

export interface IRFIDDeviceRepository extends IBaseRepository<IRFIDDevice, string | TObjectId> {
	createOne(payload: Partial<Omit<IRFIDDevice, '_id'>>): Promise<IRFIDDevice>
	findOneByDeviceSn(deviceSn: string): Promise<IRFIDDevice | null>
	findOneAndUpdate(id: TObjectId, payload: Partial<IRFIDDevice>): Promise<{ prev: IRFIDDevice; update: IRFIDDevice }>
	updateLastUsedAt(deviceSn: string, lastUsedAt: Date): Promise<void>
	deleteMany(ids: Array<string> | Array<TObjectId>): Promise<string[]>
}

export const RFID_DEVICE_REPOSITORY = Symbol('IRFIDDeviceRepository')
