import { DefectiveGoodsNotFound } from '@modules/defective-goods/domain/exceptions'
import { Inject } from '@nestjs/common'
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs'
import { DEFECTIVE_GOODS_REPOSITORY, IDefectiveGoodsRepository } from '../../ports/defective-goods.repository.port'
import { UpdateDefectiveGoodsCommand } from './update-defective-goods.command'

@CommandHandler(UpdateDefectiveGoodsCommand)
export class UpdateDefectiveGoodsHandler implements ICommandHandler<UpdateDefectiveGoodsCommand> {
	constructor(
		@Inject(DEFECTIVE_GOODS_REPOSITORY) private readonly repository: IDefectiveGoodsRepository,
		private readonly eventPublisher: EventPublisher
	) {}
	async execute({ id, update, updatedBy }: UpdateDefectiveGoodsCommand) {
		const defectiveGoods = await this.repository.findById(id)
		if (!defectiveGoods) throw new DefectiveGoodsNotFound()
		defectiveGoods.update(update, updatedBy)
		this.eventPublisher.mergeObjectContext(await this.repository.updateById(defectiveGoods.id, defectiveGoods))
		defectiveGoods.commit()
	}
}
