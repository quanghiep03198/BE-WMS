import { Inject, NotFoundException } from '@nestjs/common'
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs'
import { DEFECTIVE_GOODS_REPOSITORY, IDefectiveGoodsRepository } from '../../ports/defective-goods.repository.port'
import { DefectiveGoodsChangedEvent } from '../../../domain/events/defective-goods.events'
import { UpdateDefectiveGoodsCommand } from './update-defective-goods.command'
import { I18nContext, I18nService } from 'nestjs-i18n'

@CommandHandler(UpdateDefectiveGoodsCommand)
export class UpdateDefectiveGoodsHandler implements ICommandHandler<UpdateDefectiveGoodsCommand> {
	constructor(
		@Inject(DEFECTIVE_GOODS_REPOSITORY) private readonly repository: IDefectiveGoodsRepository,
		private readonly eventBus: EventBus,
		private readonly i18n: I18nService
	) {}
	async execute({ id, data, username }: UpdateDefectiveGoodsCommand) {
		const current = await this.repository.findById(id)
		if (!current) throw new NotFoundException(this.i18n.t('defective-goods.not_found', { lang: I18nContext.current()?.lang }))
		const updated = await this.repository.updateById(current._id.toString(), data)
		const event = new DefectiveGoodsChangedEvent([updated?._id.toString() ?? current._id.toString()], { userCodeUpdated: username })
		this.eventBus.publish(event)
		return updated
	}
}
