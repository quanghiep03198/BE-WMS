import { EventsHandler, IEventHandler } from '@nestjs/cqrs'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { RolledBackOutboundTxEvent } from '../impl/rolledback-outbound-tx.event'

@EventsHandler(RolledBackOutboundTxEvent)
export class RolledBackOutboundTxHandler implements IEventHandler<RolledBackOutboundTxEvent> {
	constructor(@InjectPinoLogger(RolledBackOutboundTxHandler.name) private readonly logger: PinoLogger) {}

	public async handle({ rolledBackEpcs }: RolledBackOutboundTxEvent) {
		this.logger.info(`Rolled back ${rolledBackEpcs.length} EPCs successfully.`)
	}
}
