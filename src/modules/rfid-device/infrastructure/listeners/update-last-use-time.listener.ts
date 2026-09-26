import { EventListener } from '@common/decorators'
import { IEventListener } from '@common/interfaces/listener.interface'
import {
	IRFIDDeviceRepository,
	RFID_DEVICE_REPOSITORY
} from '@modules/rfid-device/application/ports/rfid-device.repository.port'
import {
	UPDATE_LAST_USE_TIME_EVENT,
	UpdateLastUseTimeEvent
} from '@modules/rfid-device/domain/events/update-last-use-time.event'
import { Inject } from '@nestjs/common'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

@EventListener(UPDATE_LAST_USE_TIME_EVENT, { async: true })
export class UpdateLastUseTimeListener implements IEventListener<UpdateLastUseTimeEvent, void> {
	constructor(
		@Inject(RFID_DEVICE_REPOSITORY)
		private readonly rfidDeviceRepository: IRFIDDeviceRepository,
		@InjectPinoLogger(UpdateLastUseTimeListener.name)
		private readonly logger: PinoLogger
	) {}

	public async handle({ deviceSn }: UpdateLastUseTimeEvent): Promise<void> {
		try {
			await this.rfidDeviceRepository.updateLastUsedAt(deviceSn, new Date())
		} catch (error) {
			this.logger.error(error)
		}
	}
}
