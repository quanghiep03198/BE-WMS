import { EventsHandler, IEventHandler } from '@nestjs/cqrs'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { UpsertedEpcsMatchEvent } from './upserted-epcs-match.event'

@EventsHandler(UpsertedEpcsMatchEvent)
export class UpsertedEpcsMatchHandler implements IEventHandler<UpsertedEpcsMatchEvent> {
	constructor(@InjectPinoLogger(UpsertedEpcsMatchHandler.name) private readonly logger: PinoLogger) {}

	public handle(e: UpsertedEpcsMatchEvent) {
		this.logger.info(`Upserted EPC match with ${e.data.length} items`)
	}
}
