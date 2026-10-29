import { Inject } from '@nestjs/common'
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
		const deletedModel = await this.repository.findById(id)
		// TODO: check if the defective goods exists
		deletedModel.delete(username)
		await this.repository.softDeleteOneById(id)
		this.eventPublisher.mergeObjectContext(deletedModel)
		deletedModel.commit()
	}
}
