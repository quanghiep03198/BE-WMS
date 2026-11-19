import { RFIDDeviceType } from '../constants'
import type { IRFIDDevice } from '../interfaces/rfid-device.interface'

type RFIDDeviceSnapshot = {
	name: IRFIDDevice['device_name']
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
