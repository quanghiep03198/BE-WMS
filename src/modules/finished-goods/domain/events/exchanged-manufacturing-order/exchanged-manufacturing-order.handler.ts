import { EventsHandler, IEventHandler } from '@nestjs/cqrs'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { ExchangedManufacturingOrderEvent } from './exchanged-manufacturing-order.event'

@EventsHandler(ExchangedManufacturingOrderEvent)
export class ExchangedManufacturingOrderHandler implements IEventHandler<ExchangedManufacturingOrderEvent> {
	constructor(@InjectPinoLogger(ExchangedManufacturingOrderHandler.name) private readonly logger: PinoLogger) {}

	public async handle({ exchangeSkus, targetMo }: ExchangedManufacturingOrderEvent) {
		this.logger.info(`Updated ${exchangeSkus.length} EPCs to target MO ${targetMo} successfully.`)
	}
}
