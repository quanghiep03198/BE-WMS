import { DefectiveGoodsModel } from '@modules/defective-goods/domain/models/defective-goods.model'
import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs'
import { DefectiveGoodsCreatedEvent } from '../../../domain/events/defective-goods.events'
import { DEFECTIVE_GOODS_REPOSITORY, IDefectiveGoodsRepository } from '../../ports/defective-goods.repository.port'
import { CreateDefectiveGoodsCommand } from './create-defective-goods.command'

@CommandHandler(CreateDefectiveGoodsCommand)
export class CreateDefectiveGoodsHandler implements ICommandHandler<CreateDefectiveGoodsCommand> {
	constructor(
		@Inject(DEFECTIVE_GOODS_REPOSITORY) private readonly repository: IDefectiveGoodsRepository,
		private readonly eventBus: EventBus
	) {}

	async execute({ payload, user }: CreateDefectiveGoodsCommand) {
		const newMatches = DefectiveGoodsModel.create({ ...payload, created_by: user._id })
		const records = await this.repository.insertMany(newMatches)
		this.eventBus.publish(
			new DefectiveGoodsCreatedEvent(
				records.map(({ _id }) => _id.toString()),
				{ userCodeCreated: user.username }
			)
		)
	}
}
