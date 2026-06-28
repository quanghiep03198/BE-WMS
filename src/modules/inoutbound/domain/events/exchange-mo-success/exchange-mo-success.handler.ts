import { EventsHandler, IEventHandler } from '@nestjs/cqrs'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { ExchangeMoSuccessEvent } from './exchange-mo-success.event'

@EventsHandler(ExchangeMoSuccessEvent)
export class ExchangeMoSuccessEventHandler implements IEventHandler<ExchangeMoSuccessEvent> {
	constructor(@InjectPinoLogger(ExchangeMoSuccessEventHandler.name) private readonly logger: PinoLogger) {}

	public async handle({ source: sourceMos, target: targetMo }: ExchangeMoSuccessEvent) {
		this.logger.info(`Updated ${sourceMos.join(', ')} to ${targetMo} in MSSQL`)
	}
}
