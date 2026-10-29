import { Inject } from '@nestjs/common'
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { DEFECTIVE_GOODS_REPOSITORY, IDefectiveGoodsRepository } from '../../ports/defective-goods.repository.port'
import { DeleteManyDefectiveGoodsCommand } from './delete-many-defective-goods.command'

@CommandHandler(DeleteManyDefectiveGoodsCommand)
export class DeleteManyDefectiveGoodsHandler implements ICommandHandler<DeleteManyDefectiveGoodsCommand> {
	constructor(
		@InjectPinoLogger(DeleteManyDefectiveGoodsHandler.name)
		private readonly logger: PinoLogger,
		@Inject(DEFECTIVE_GOODS_REPOSITORY)
		private readonly defectiveGoodsRepository: IDefectiveGoodsRepository,
		private readonly eventPublisher: EventPublisher
	) {}

	async execute({ filters, username }: DeleteManyDefectiveGoodsCommand) {
		const deletedModels = await this.defectiveGoodsRepository.deleteMany(filters)
		deletedModels.forEach((model) => model.delete(username))
		deletedModels.forEach((model) => {
			this.eventPublisher.mergeObjectContext(model)
			model.commit()
		})
	}
}
