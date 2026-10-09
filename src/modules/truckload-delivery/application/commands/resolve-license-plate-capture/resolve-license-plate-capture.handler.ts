import { Inject } from '@nestjs/common'
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { CAR_LICENSE_PLATE_REPOSITORY, ICarLicensePlateRepository } from '../../ports/car-license-plate.repository.port'
import {
	ITruckloadDeliveryRepository,
	TRUCKLOAD_DELIVERY_REPOSITORY
} from '../../ports/truckload-delivery.repository.port'
import { ResolveLicensePlateCaptureCommand } from './resolve-license-plate-capture.command'

@CommandHandler(ResolveLicensePlateCaptureCommand)
export class ResolveLicensePlateCaptureHandler implements ICommandHandler<ResolveLicensePlateCaptureCommand, void> {
	constructor(
		@InjectPinoLogger(ResolveLicensePlateCaptureHandler.name) private readonly logger: PinoLogger,
		@Inject(TRUCKLOAD_DELIVERY_REPOSITORY) private readonly truckloadDeliveryRepository: ITruckloadDeliveryRepository,
		@Inject(CAR_LICENSE_PLATE_REPOSITORY) private readonly carLicensePlateRepository: ICarLicensePlateRepository,
		private readonly eventPublisher: EventPublisher
	) {}

	async execute({ dispatchOrder }: ResolveLicensePlateCaptureCommand): Promise<void> {
		const found = await this.truckloadDeliveryRepository.findByDispatchOrder(dispatchOrder)
		if (!found) return

		const { license_plate } = found.toProps()
		const window = found.captureWindow
		this.logger.debug({ license_plate, window })
		if (!license_plate || !window || window.from > window.to) return

		const snapshot = await this.carLicensePlateRepository.findLatestSnapshot(license_plate, window.from, window.to)

		if (!snapshot) {
			this.logger.info('No license plate snapshot found for dispatch order')
			return
		}

		const model = this.eventPublisher.mergeObjectContext(found)
		if (!model.applyLicensePlateCapture(snapshot.snap_time, snapshot.images)) return

		try {
			await this.truckloadDeliveryRepository.save(model)
			model.commit()
		} catch (error) {
			this.logger.warn({ error, dispatchOrder }, 'Failed to resolve license plate capture')
		}
	}
}
