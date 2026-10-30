import { DefectiveGoodsDomainModel } from '@modules/defective-goods/domain/models/defective-goods.model'
import { Inject } from '@nestjs/common'
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs'
import { DEFECTIVE_GOODS_REPOSITORY, IDefectiveGoodsRepository } from '../../ports/defective-goods.repository.port'
import { CreateDefectiveGoodsCommand } from './create-defective-goods.command'

@CommandHandler(CreateDefectiveGoodsCommand)
export class CreateDefectiveGoodsHandler implements ICommandHandler<CreateDefectiveGoodsCommand> {
	constructor(
		@Inject(DEFECTIVE_GOODS_REPOSITORY) private readonly repository: IDefectiveGoodsRepository,
		private readonly eventPublisher: EventPublisher
	) {}

	async execute({ payload, user }: CreateDefectiveGoodsCommand) {
		const defectiveGoods = DefectiveGoodsDomainModel.create({
			...payload,
			created_by: user._id
		} as FirstParameter<typeof DefectiveGoodsDomainModel.create>)
		const created = await this.repository.create(defectiveGoods)
		created.forEach((model) => {
			model.insert()
			this.eventPublisher.mergeObjectContext(model)
			model.commit()
		})
	}
}
