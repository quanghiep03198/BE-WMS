import { Inject, NotFoundException } from '@nestjs/common'
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { DefectiveGoodsChangedEvent } from '../../../domain/events/defective-goods.events'
import { DEFECTIVE_GOODS_REPOSITORY, IDefectiveGoodsRepository } from '../../ports/defective-goods.repository.port'
import { UpdateDefectiveGoodsCommand } from './update-defective-goods.command'

@CommandHandler(UpdateDefectiveGoodsCommand)
export class UpdateDefectiveGoodsHandler implements ICommandHandler<UpdateDefectiveGoodsCommand> {
	constructor(
		@Inject(DEFECTIVE_GOODS_REPOSITORY) private readonly repository: IDefectiveGoodsRepository,
		private readonly eventBus: EventBus,
		private readonly i18n: I18nService
	) {}
	async execute({ id, data, username }: UpdateDefectiveGoodsCommand) {
		const current = await this.repository.findOneById(id)
		if (!current)
			throw new NotFoundException(this.i18n.t('defective-goods.not_found', { lang: I18nContext.current()?.lang }))
		await this.repository.updateById(current._id.toString(), data)
		this.eventBus.publish(new DefectiveGoodsChangedEvent([current._id.toString()], { updatedBy: username }))
	}
}
