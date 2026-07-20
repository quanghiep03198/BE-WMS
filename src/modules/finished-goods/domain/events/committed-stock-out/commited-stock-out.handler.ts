import { FinishedGoodsGateway } from '@modules/finished-goods/presentation/gateways/inoutbound.gateway'
import { EventsHandler, IEventHandler } from '@nestjs/cqrs'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { CommittedStockOutEvent } from './committed-stock-out.event'

@EventsHandler(CommittedStockOutEvent)
export class CommittedStockOutHandler implements IEventHandler<CommittedStockOutEvent> {
	constructor(
		private readonly finishedGoodsGateway: FinishedGoodsGateway,
		private readonly i18nService: I18nService
	) {}

	public handle({ commitedStockOutQty }: CommittedStockOutEvent): void {
		this.finishedGoodsGateway.server.emit(
			'finished_goods:outbound:success',
			this.i18nService.t('inoutbound.notification.stock_in_success', {
				args: { quantity: commitedStockOutQty },
				lang: I18nContext.current()?.lang
			})
		)
	}
}
