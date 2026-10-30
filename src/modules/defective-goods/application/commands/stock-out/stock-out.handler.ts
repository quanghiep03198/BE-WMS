import { ConflictException, Inject } from '@nestjs/common'
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { DefectiveGoodsChangedEvent } from '../../../domain/events/defective-goods.events'
import { DEFECTIVE_GOODS_REPOSITORY, IDefectiveGoodsRepository } from '../../ports/defective-goods.repository.port'
import { StockOutDefectiveGoodsCommand } from './stock-out.command'

@CommandHandler(StockOutDefectiveGoodsCommand)
export class StockOutDefectiveGoodsHandler implements ICommandHandler<StockOutDefectiveGoodsCommand> {
	constructor(
		@Inject(DEFECTIVE_GOODS_REPOSITORY) private readonly defectiveGoodsRepository: IDefectiveGoodsRepository,
		private readonly eventBus: EventBus,
		private readonly i18n: I18nService
	) {}

	async execute({ data, updatedBy, filters, take }: StockOutDefectiveGoodsCommand) {
		const documents = await this.defectiveGoodsRepository.find({ epc: { $in: data.epcs } })
		if (documents.some(({ inbound_date, storage_location }) => !inbound_date || !storage_location)) {
			throw new ConflictException(
				this.i18n.t('inoutbound.notification.not_inbound_yet', { lang: I18nContext.current()?.lang })
			)
		}
		const updatedIds = await this.defectiveGoodsRepository.stockOut(data, updatedBy, filters, take)
		this.eventBus.publish(new DefectiveGoodsChangedEvent(updatedIds, { updatedBy: updatedBy.username }))
	}
}
