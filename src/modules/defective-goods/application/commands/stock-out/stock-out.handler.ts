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

	async execute({ data, user }: StockOutDefectiveGoodsCommand) {
		const documents = await this.defectiveGoodsRepository.findAll({ epc: { $in: data.epcs } })
		if (documents.some(({ inbound_date, storage_location }) => !inbound_date || !storage_location)) {
			throw new ConflictException(
				this.i18n.t('inoutbound.notification.not_inbound_yet', { lang: I18nContext.current()?.lang })
			)
		}

		const updated = await this.defectiveGoodsRepository.stockOut(data, user)

		// const deleted = await this.defectiveGoodsRepository.softDeleteMany({ epc: { $in: data.epcs } })
		this.eventBus.publish(
			new DefectiveGoodsChangedEvent(
				updated.map(({ _id }) => _id.toString()),
				{ userCodeUpdated: user.username }
			)
		)
		// return { affected: deleted.length }
	}
}
