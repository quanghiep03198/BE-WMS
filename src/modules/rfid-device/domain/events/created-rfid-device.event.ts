import { RFIDDeviceType } from '../constants'

export class CreatedRFIDDeviceEvent {
	constructor(
		public readonly deviceSn: string,
		public readonly name: { vi: string; en: string; cn: string },
		public readonly stationNo: string,
		public readonly ipAddress: string,
		public readonly type: RFIDDeviceType,
		public readonly createdBy: string
	) {}
}

export const CREATED_RFID_DEVICE_EVENT = 'rfid-device.created'
