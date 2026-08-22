import { EventsHandler, IEventHandler } from '@nestjs/cqrs'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { RolledBackInboundTxEvent } from './rolledback-inbound-tx.event'

@EventsHandler(RolledBackInboundTxEvent)
export class RolledBackInboundTxHandler implements IEventHandler<RolledBackInboundTxEvent> {
	constructor(@InjectPinoLogger(RolledBackInboundTxHandler.name) private readonly logger: PinoLogger) {}

	public async handle({ rolledBackEpcs }: RolledBackInboundTxEvent) {
		this.logger.info(`Rolled back ${rolledBackEpcs.length} EPCs successfully.`)
	}
}
