import { FinishedGoodsGateway } from '@modules/finished-goods/presentation/gateways/inoutbound.gateway'
import { EventsHandler, IEventHandler } from '@nestjs/cqrs'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { CommitedStockIn } from './commited-stock-in.event'

@EventsHandler(CommitedStockIn)
export class CommitedStockInHandler implements IEventHandler<CommitedStockIn> {
	constructor(
		private readonly finishedGoodsGateway: FinishedGoodsGateway,
		private readonly i18nService: I18nService
	) {}

	public async handle({ commitedStockInQty }: CommitedStockIn): Promise<void> {
		this.finishedGoodsGateway.server.emit(
			'finished_goods:inbound:success',
			this.i18nService.t('inoutbound.notification.stock_in_success', {
				args: { quantity: commitedStockInQty },
				lang: I18nContext.current()?.lang
			})
		)
	}
}
