import { FinishedGoodsGateway } from '@modules/finished-goods/presentation/gateways/finished-goods.gateway'
import { EventsHandler, IEventHandler } from '@nestjs/cqrs'
import { I18nService } from 'nestjs-i18n'
import { UpsertedEpcsMatchEvent } from './upserted-epcs-match.event'

@EventsHandler(UpsertedEpcsMatchEvent)
export class UpsertedEpcsMatchHandler implements IEventHandler<UpsertedEpcsMatchEvent> {
	constructor(
		private readonly finishedGoodsGateway: FinishedGoodsGateway,
		private readonly i18nService: I18nService
	) {}

	public handle() {
		this.finishedGoodsGateway.server.emit(
			'finished_goods:upserted_epcs_match:success',
			this.i18nService.t('inoutbound.notification.upserted_epcs_match')
		)
	}
}
