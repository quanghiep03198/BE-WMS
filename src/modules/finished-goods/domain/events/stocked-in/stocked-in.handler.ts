import { EventsHandler, IEventHandler } from '@nestjs/cqrs'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { StockedInEvent } from './stocked-in.event'

@EventsHandler(StockedInEvent)
export class StockedInHandler implements IEventHandler<StockedInEvent> {
	constructor(@InjectPinoLogger(StockedInHandler.name) private readonly logger: PinoLogger) {}

	async handle({ scannedEpcs }: StockedInEvent) {
		this.logger.info(`Upserted ${scannedEpcs.length} EPCs to MSSQL database successfully.`)
	}
}
