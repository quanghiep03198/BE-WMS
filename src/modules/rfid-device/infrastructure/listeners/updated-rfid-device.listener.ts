import { EventListener } from '@common/decorators'
import { IEventListener } from '@common/interfaces/listener.interface'
import { RFIDDeviceType } from '@modules/rfid-device/domain/constants'
import {
	UPDATED_RFID_DEVICE_EVENT,
	UpdatedRFIDDeviceEvent
} from '@modules/rfid-device/domain/events/updated-rfid-device.event'
import { RmdbsRFIDDeviceRepository } from '@modules/rfid-device/infrastructure/persistence/mssql/repositories/rmdbs-rfid-device.repository'

@EventListener(UPDATED_RFID_DEVICE_EVENT, { async: true })
export class UpdatedRFIDDeviceListener implements IEventListener<UpdatedRFIDDeviceEvent, void> {
	constructor(private readonly rfidDeviceRepository: RmdbsRFIDDeviceRepository) {}

	public async handle(event: UpdatedRFIDDeviceEvent): Promise<void> {
		await this.rfidDeviceRepository.updateOneByDeviceSn(event.deviceSn, {
			device_name_vi: event.update.name.vi,
			device_name_en: event.update.name.en,
			device_name_cn: event.update.name.cn,
			device_ant: event.update.type === RFIDDeviceType.ANTENNA ? '1' : null,
			station_no: event.update.station_no,
			tcp_ip: event.update.tcp_ip,
			user_code_updated: event.update.updated_by,
			user_name_updated: event.update.updated_by
		})
	}
}
