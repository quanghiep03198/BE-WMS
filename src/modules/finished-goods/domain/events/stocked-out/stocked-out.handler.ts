import { EventsHandler, IEventHandler } from '@nestjs/cqrs'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { StockedOutEvent } from './stocked-out.event'

@EventsHandler(StockedOutEvent)
export class StockedOutHandler implements IEventHandler<StockedOutEvent> {
	constructor(@InjectPinoLogger(StockedOutHandler.name) private readonly logger: PinoLogger) {}

	async handle({ scannedEpcs }: StockedOutEvent) {
		this.logger.info(`Upserted ${scannedEpcs.length} EPCs to MSSQL database successfully.`)
	}
}
