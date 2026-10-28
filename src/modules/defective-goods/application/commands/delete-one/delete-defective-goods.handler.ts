import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs'
import { DefectiveGoodsChangedEvent } from '../../../domain/events/defective-goods.events'
import { DEFECTIVE_GOODS_REPOSITORY, IDefectiveGoodsRepository } from '../../ports/defective-goods.repository.port'
import { DeleteOneDefectiveGoodsCommand } from './delete-defective-goods.command'

@CommandHandler(DeleteOneDefectiveGoodsCommand)
export class DeleteOneDefectiveGoodsHandler implements ICommandHandler<DeleteOneDefectiveGoodsCommand> {
	constructor(
		@Inject(DEFECTIVE_GOODS_REPOSITORY) private readonly repository: IDefectiveGoodsRepository,
		private readonly eventBus: EventBus
	) {}
	async execute({ id, username }: DeleteOneDefectiveGoodsCommand) {
		await this.repository.softDeleteOneById(id)
		this.eventBus.publish(new DefectiveGoodsChangedEvent([id], { userCodeUpdated: username }))
	}
}
