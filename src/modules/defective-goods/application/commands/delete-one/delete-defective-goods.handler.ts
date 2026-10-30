import { Inject, NotFoundException } from '@nestjs/common'
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs'
import { DEFECTIVE_GOODS_REPOSITORY, IDefectiveGoodsRepository } from '../../ports/defective-goods.repository.port'
import { DeleteOneDefectiveGoodsCommand } from './delete-defective-goods.command'

@CommandHandler(DeleteOneDefectiveGoodsCommand)
export class DeleteOneDefectiveGoodsHandler implements ICommandHandler<DeleteOneDefectiveGoodsCommand> {
	constructor(
		@Inject(DEFECTIVE_GOODS_REPOSITORY) private readonly repository: IDefectiveGoodsRepository,
		private readonly eventPublisher: EventPublisher
	) {}
	async execute({ id, username }: DeleteOneDefectiveGoodsCommand) {
		const pendingDeleteItem = await this.repository.findById(id)
		if (!pendingDeleteItem) throw new NotFoundException()
		pendingDeleteItem.delete(username)
		await this.repository.softDeleteOneById(id)
		this.eventPublisher.mergeObjectContext(pendingDeleteItem)
		pendingDeleteItem.commit()
	}
}
