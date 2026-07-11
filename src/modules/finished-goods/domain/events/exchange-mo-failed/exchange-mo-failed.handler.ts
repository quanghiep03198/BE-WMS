import { InoutboundGateway } from '@modules/finished-goods/presentation/gateways/inoutbound.gateway'
import { EventsHandler, IEventHandler } from '@nestjs/cqrs'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { ExchangeMoFailedEvent } from './exchange-mo-failed.event'

@EventsHandler(ExchangeMoFailedEvent)
export class ExchangeMoFailedHandler implements IEventHandler<ExchangeMoFailedEvent> {
	constructor(
		@InjectPinoLogger(ExchangeMoFailedHandler.name) private readonly logger: PinoLogger,
		private readonly inoutboundGateway: InoutboundGateway
	) {}

	public async handle({ targetMo }: ExchangeMoFailedEvent) {
		this.logger.error(`Exchange MO failed for target MO: ${targetMo}`)
		this.logger.info(`Rolling back any changes made during the exchange process for target MO: ${targetMo}`)
		this.inoutboundGateway.server.emit(
			'exchange_mo_error',
			`Exchange MO failed for target MO: ${targetMo}. Rolling back any changes made during the exchange process.`
		)
	}
}
