export class DeletedRFIDDevicesEvent {
	constructor(public readonly deviceSns: Array<string>) {}
}

export const DELETED_RFID_DEVICES_EVENT = 'rfid-device.deleted'
