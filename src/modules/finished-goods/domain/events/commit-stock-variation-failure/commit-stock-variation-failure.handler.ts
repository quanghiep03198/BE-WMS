import { FinishedGoodsGateway } from '@modules/finished-goods/presentation/gateways/finished-goods.gateway'
import { EventsHandler, IEventHandler } from '@nestjs/cqrs'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { CommitStockVariationFailureEvent } from './commit-stock-variation-failure.event'

/**
 * @deprecated
 */
@EventsHandler(CommitStockVariationFailureEvent)
export class CommitStockVariationFailureHandler implements IEventHandler<CommitStockVariationFailureEvent> {
	constructor(
		private readonly finishedGoodsGateway: FinishedGoodsGateway,
		private readonly i18nService: I18nService
	) {
		void this.i18nService
	}

	public async handle({ stockFlow }: CommitStockVariationFailureEvent): Promise<void> {
		this.finishedGoodsGateway.server.emit(
			'finished_goods:inbound:error',
			this.i18nService.t('inoutbound.notification.stock_in_failed', {
				lang: I18nContext.current()?.lang
			})
		)
	}
}
