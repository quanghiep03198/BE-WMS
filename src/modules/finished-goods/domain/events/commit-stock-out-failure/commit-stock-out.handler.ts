// import { FinishedGoodsGateway } from '@modules/finished-goods/presentation/gateways/finished-goods.gateway'
import { FinishedGoodsGateway } from '@modules/finished-goods/presentation/gateways/finished-goods.gateway'
import { EventsHandler, IEventHandler } from '@nestjs/cqrs'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { CommitStockOutFailureEvent } from './commit-stock-out-failure.event'

/**
 * @deprecated
 */
@EventsHandler(CommitStockOutFailureEvent)
export class CommitStockOutFailureHandler implements IEventHandler<CommitStockOutFailureEvent> {
	constructor(
		private readonly finishedGoodsGateway: FinishedGoodsGateway,
		private readonly i18nService: I18nService
	) {}

	public handle() {
		this.finishedGoodsGateway.server.emit(
			'finished_goods:outbound:error',
			this.i18nService.t('inoutbound.notification.stock_out_failed', {
				lang: I18nContext.current()?.lang
			})
		)
	}
}
