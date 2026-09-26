import { EventListener } from '@common/decorators'
import { IEventListener } from '@common/interfaces/listener.interface'
import { RFIDDeviceType } from '@modules/rfid-device/domain/constants'
import {
	CREATED_RFID_DEVICE_EVENT,
	CreatedRFIDDeviceEvent
} from '@modules/rfid-device/domain/events/created-rfid-device.event'
import { RmdbsRFIDDeviceRepository } from '@modules/rfid-device/infrastructure/persistence/mssql/repositories/rmdbs-rfid-device.repository'
import { ConfigService } from '@nestjs/config'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

@EventListener(CREATED_RFID_DEVICE_EVENT, { async: true })
export class CreatedRFIDDeviceListener implements IEventListener<CreatedRFIDDeviceEvent, void> {
	constructor(
		private readonly rfidDeviceRepository: RmdbsRFIDDeviceRepository,
		private readonly configService: ConfigService<ProcessEnv>,
		@InjectPinoLogger(CreatedRFIDDeviceListener.name)
		private readonly logger: PinoLogger
	) {}

	public async handle(event: CreatedRFIDDeviceEvent): Promise<void> {
		this.logger.info(`Handling CreatedRFIDDeviceEvent for device: ${event.deviceSn}`)

		const factory = this.configService.get<FactoryCode>('APP_TENANCY')

		await this.rfidDeviceRepository.insertOne({
			device_name_vi: event.name.vi,
			device_name_en: event.name.en,
			device_name_cn: event.name.cn,
			device_sn: event.deviceSn,
			device_ant: event.type === RFIDDeviceType.ANTENNA ? '1' : null,
			station_no: event.stationNo,
			tcp_ip: event.ipAddress,
			ip_port: '',
			factory_code: factory,
			user_code_created: event.createdBy,
			user_name_created: event.createdBy
		})
	}
}
