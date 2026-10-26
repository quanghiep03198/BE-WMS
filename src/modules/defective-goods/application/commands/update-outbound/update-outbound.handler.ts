import { ConflictException, Inject } from '@nestjs/common'
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { DefectiveCategory, DefectiveGoodsOutboundPurpose } from '../../../domain/constants'
import { DefectiveGoodsChangedEvent } from '../../../domain/events/defective-goods.events'
import { DEFECTIVE_GOODS_REPOSITORY, IDefectiveGoodsRepository } from '../../ports/defective-goods.repository.port'
import { UpdateOutboundCommand } from './update-outbound.command'

@CommandHandler(UpdateOutboundCommand)
export class UpdateOutboundHandler implements ICommandHandler<UpdateOutboundCommand> {
	constructor(
		@Inject(DEFECTIVE_GOODS_REPOSITORY) private readonly repository: IDefectiveGoodsRepository,
		private readonly eventBus: EventBus,
		private readonly i18n: I18nService
	) {}

	async execute({ data, userId, username }: UpdateOutboundCommand) {
		const documents = await this.repository.findManyForWrite({ epc: { $in: data.epcs } })
		if (documents.some(({ inbound_date, storage_location }) => !inbound_date || !storage_location)) {
			throw new ConflictException(this.i18n.t('inoutbound.notification.not_inbound_yet', { lang: I18nContext.current()?.lang }))
		}
		const now = new Date()
		for (const document of documents) {
			const downgrade = data.outbound_purpose === DefectiveGoodsOutboundPurpose.RUIN && document.defective_category !== DefectiveCategory.C_GRADE
			await this.repository.updateById(document._id.toString(), {
				outbound_date: now,
				outbound_purpose: data.outbound_purpose,
				...(data.po && { po: data.po }),
				...(downgrade && { defective_category: DefectiveCategory.C_GRADE }),
				updated_by: userId
			})
		}
		const deleted = await this.repository.softDeleteMany({ epc: { $in: data.epcs } })
		this.eventBus.publish(new DefectiveGoodsChangedEvent(deleted.map(({ _id }) => _id.toString()), { userCodeUpdated: username }))
		return { affected: deleted.length }
	}
}
