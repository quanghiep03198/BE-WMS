import { RFIDDeviceType } from '../constants'
import type { IRFIDDevice } from '../interfaces/rfid-device.interface'

export class CreatedRFIDDeviceEvent {
	constructor(
		public readonly deviceSn: string,
		public readonly name: IRFIDDevice['device_name'],
		public readonly stationNo: string,
		public readonly ipAddress: string,
		public readonly type: RFIDDeviceType,
		public readonly createdBy: string
	) {}
}

export const CREATED_RFID_DEVICE_EVENT = 'rfid-device.created'
