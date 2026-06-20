import { InoutboundGateway } from '@/modules/inoutbound/presentation/gateways/inoutbound.gateway'
import { EventsHandler, IEventHandler } from '@nestjs/cqrs'
import { I18nService } from 'nestjs-i18n'
import { UpdateStockInDateFailedEvent } from './update-stock-in-date-failed.event'

@EventsHandler(UpdateStockInDateFailedEvent)
export class UpdateStockInDateFailedEventHandler implements IEventHandler<UpdateStockInDateFailedEvent> {
	constructor(
		private readonly inoutboundGateway: InoutboundGateway,
		private readonly i18nService: I18nService
	) {}

	public async handle() {
		this.inoutboundGateway.server.emit(
			'inbound.update_stock_in_date_failed',
			'Failed to save stock in date. Please try again later.'
		)
	}
}
