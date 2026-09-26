import { EventListener } from '@common/decorators'
import { IEventListener } from '@common/interfaces/listener.interface'
import {
	DELETED_RFID_DEVICES_EVENT,
	DeletedRFIDDevicesEvent
} from '@modules/rfid-device/domain/events/deleted-rfid-devices.event'
import { RmdbsRFIDDeviceRepository } from '@modules/rfid-device/infrastructure/persistence/mssql/repositories/rmdbs-rfid-device.repository'

@EventListener(DELETED_RFID_DEVICES_EVENT, { async: true })
export class DeletedRFIDDevicesListener implements IEventListener<DeletedRFIDDevicesEvent, void> {
	constructor(private readonly rfidDeviceRepository: RmdbsRFIDDeviceRepository) {}

	public async handle({ deviceSns }: DeletedRFIDDevicesEvent): Promise<void> {
		await this.rfidDeviceRepository.deleteManyByDeviceSns(deviceSns)
	}
}
