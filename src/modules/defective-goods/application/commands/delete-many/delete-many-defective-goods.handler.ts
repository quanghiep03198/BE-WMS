import { DefectiveGoodsChangedEvent } from '@modules/defective-goods/domain/events/defective-goods.events'
import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs'
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
		private readonly eventBus: EventBus
	) {}

	async execute({ filters, username }: DeleteManyDefectiveGoodsCommand) {
		const deletedIds = await this.defectiveGoodsRepository.deleteMany(filters)
		this.eventBus.publish(new DefectiveGoodsChangedEvent(deletedIds, { updatedBy: username }))
	}
}
