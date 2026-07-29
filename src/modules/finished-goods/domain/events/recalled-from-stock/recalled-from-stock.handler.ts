import { EventsHandler, IEventHandler } from '@nestjs/cqrs'
import { I18nService } from 'nestjs-i18n'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { FinishedGoodsGateway } from './../../../presentation/gateways/inoutbound.gateway'
import { RecalledFromStockEvent } from './recalled-from-stock.event'

@EventsHandler(RecalledFromStockEvent)
export class RecalledFromStockHandler implements IEventHandler<RecalledFromStockEvent> {
	constructor(
		@InjectPinoLogger(RecalledFromStockEvent.name) private readonly logger: PinoLogger,
		private readonly finishedGoodsGateway: FinishedGoodsGateway,
		private readonly i18nService: I18nService
	) {}

	public handle(event: RecalledFromStockEvent): void {
		this.logger.debug(`RecalledFromStockEvent handled with ${event.recalledEpcs.length} recalled EPCs`)

		// TODO: Add declaration for the translation key in the i18n files
		this.finishedGoodsGateway.server.emit(
			'recalled',
			this.i18nService.t('inoutbound.notification.recalled_from_stock')
		)
	}
}
