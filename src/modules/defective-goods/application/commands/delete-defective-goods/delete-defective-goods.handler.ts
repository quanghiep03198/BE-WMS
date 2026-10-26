import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs'
import { DEFECTIVE_GOODS_REPOSITORY, IDefectiveGoodsRepository } from '../../ports/defective-goods.repository.port'
import { DefectiveGoodsChangedEvent } from '../../../domain/events/defective-goods.events'
import { DeleteDefectiveGoodsCommand } from './delete-defective-goods.command'

@CommandHandler(DeleteDefectiveGoodsCommand)
export class DeleteDefectiveGoodsHandler implements ICommandHandler<DeleteDefectiveGoodsCommand> {
	constructor(@Inject(DEFECTIVE_GOODS_REPOSITORY) private readonly repository: IDefectiveGoodsRepository, private readonly eventBus: EventBus) {}
	async execute({ ids, filter, username }: DeleteDefectiveGoodsCommand) {
		const documents = await this.repository.softDeleteMany(ids.length ? { $and: [{ _id: { $in: ids } }, filter] } : filter)
		this.eventBus.publish(new DefectiveGoodsChangedEvent(documents.map(({ _id }) => _id.toString()), { userCodeUpdated: username }))
		return { affected: documents.length }
	}
}
