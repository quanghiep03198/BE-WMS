import { Inject } from '@nestjs/common'
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs'
import { DEFECTIVE_GOODS_REPOSITORY, IDefectiveGoodsRepository } from '../../ports/defective-goods.repository.port'
import { DeleteManyDefectiveGoodsCommand } from './delete-many-defective-goods.command'

@CommandHandler(DeleteManyDefectiveGoodsCommand)
export class DeleteManyDefectiveGoodsHandler implements ICommandHandler<DeleteManyDefectiveGoodsCommand> {
	constructor(
		@Inject(DEFECTIVE_GOODS_REPOSITORY)
		private readonly repository: IDefectiveGoodsRepository,
		private readonly eventPublisher: EventPublisher
	) {}

	async execute({ filters, deletedBy }: DeleteManyDefectiveGoodsCommand) {
		const deletedModels = await this.repository.deleteMany(filters)
		deletedModels.forEach((model) => {
			model.delete(deletedBy)
			this.eventPublisher.mergeObjectContext(model)
			model.commit()
		})
	}
}
