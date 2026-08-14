import { EventsHandler, IEventHandler } from '@nestjs/cqrs'
import { I18nContext } from 'nestjs-i18n'
import { FinishedGoodsGateway } from '../../../presentation/gateways/finished-goods.gateway'
import { RecalledFromStockEvent } from './recalled-from-stock.event'

@EventsHandler(RecalledFromStockEvent)
export class RecalledFromStockHandler implements IEventHandler<RecalledFromStockEvent> {
	constructor(private readonly finishedGoodsGateway: FinishedGoodsGateway) {}

	public handle(event: RecalledFromStockEvent): void {
		this.finishedGoodsGateway.server.emit(
			'stock:recalled:success',
			I18nContext.current().t('inoutbound.notification.recalled_from_stock', {
				args: { quantity: event.recalledEpcs.length },
				lang: I18nContext.current()?.lang
			})
		)
	}
}
