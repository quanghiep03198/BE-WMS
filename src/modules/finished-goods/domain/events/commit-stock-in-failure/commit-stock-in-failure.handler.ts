import { FinishedGoodsGateway } from '@modules/finished-goods/presentation/gateways/inoutbound.gateway'
import { EventsHandler, IEventHandler } from '@nestjs/cqrs'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { CommitStockInFailureEvent } from './commit-stock-in-failure.event'

@EventsHandler(CommitStockInFailureEvent)
export class CommitStockInFailureHandler implements IEventHandler<CommitStockInFailureEvent> {
	constructor(
		private readonly finishedGoodsGateway: FinishedGoodsGateway,
		private readonly i18nService: I18nService
	) {
		void this.i18nService
	}

	public async handle() {
		this.finishedGoodsGateway.server.emit(
			'finished_goods:inbound:error',
			this.i18nService.t('inoutbound.notification.stock_in_failed', {
				lang: I18nContext.current()?.lang
			})
		)
	}
}
