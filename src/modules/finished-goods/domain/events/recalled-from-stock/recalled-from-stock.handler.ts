import { EventsHandler, IEventHandler } from '@nestjs/cqrs'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { RecalledFromStockEvent } from './recalled-from-stock.event'

@EventsHandler(RecalledFromStockEvent)
export class RecalledFromStockHandler implements IEventHandler<RecalledFromStockEvent> {
	constructor(@InjectPinoLogger(RecalledFromStockHandler.name) private readonly logger: PinoLogger) {}

	public handle(event: RecalledFromStockEvent): void {
		this.logger.info(`Recalled from stock: ${event.recalledEpcs.length} items`)
	}
}
