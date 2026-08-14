import { EventsHandler } from '@nestjs/cqrs'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { CheckedOutInventoryEvent } from './checked-out-inventory.event'

@EventsHandler(CheckedOutInventoryEvent)
export class CheckedOutInventoryHandler {
	constructor(@InjectPinoLogger(CheckedOutInventoryHandler.name) private readonly logger: PinoLogger) {}

	handle(event: CheckedOutInventoryEvent) {
		this.logger.info(`Inventory audit for month ${event.month} has been checked out.`)
	}
}
