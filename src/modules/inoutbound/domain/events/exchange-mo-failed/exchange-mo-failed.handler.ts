import { InoutboundGateway } from '@/modules/inoutbound/presentation/gateways/inoutbound.gateway'
import { EventsHandler, IEventHandler } from '@nestjs/cqrs'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { ExchangeMoFailedEvent } from './exchange-mo-failed.event'

@EventsHandler(ExchangeMoFailedEvent)
export class ExchangeMoFailedEventHandler implements IEventHandler<ExchangeMoFailedEvent> {
	constructor(
		@InjectPinoLogger(ExchangeMoFailedEventHandler.name) private readonly logger: PinoLogger,
		private readonly inoutboundGateway: InoutboundGateway
	) {}

	public async handle({ targetMo }: ExchangeMoFailedEvent) {
		this.logger.error(`Exchange MO failed for target MO: ${targetMo}`)
		this.logger.info(`Rolling back any changes made during the exchange process for target MO: ${targetMo}`)
	}
}
