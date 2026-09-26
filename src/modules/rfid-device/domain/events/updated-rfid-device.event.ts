import { RFIDDeviceType } from '../constants'

type RFIDDeviceSnapshot = {
	name: { vi: string; en: string; cn: string }
	station_no: string
	tcp_ip: string
	type: RFIDDeviceType
}

export class UpdatedRFIDDeviceEvent {
	constructor(
		public readonly deviceSn: string,
		public readonly prev: RFIDDeviceSnapshot,
		public readonly update: RFIDDeviceSnapshot & { updated_by: string }
	) {}
}

export const UPDATED_RFID_DEVICE_EVENT = 'rfid-device.updated'
