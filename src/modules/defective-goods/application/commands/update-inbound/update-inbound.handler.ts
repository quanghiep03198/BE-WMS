import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs'
import { DEFECTIVE_GOODS_REPOSITORY, IDefectiveGoodsRepository } from '../../ports/defective-goods.repository.port'
import { DefectiveGoodsChangedEvent } from '../../../domain/events/defective-goods.events'
import { UpdateInboundCommand } from './update-inbound.command'

@CommandHandler(UpdateInboundCommand)
export class UpdateInboundHandler implements ICommandHandler<UpdateInboundCommand> {
	constructor(@Inject(DEFECTIVE_GOODS_REPOSITORY) private readonly repository: IDefectiveGoodsRepository, private readonly eventBus: EventBus) {}
	async execute({ data, userId, username }: UpdateInboundCommand) {
		const documents = await this.repository.findManyForWrite({ epc: { $in: data.epcs } })
		const inboundDate = new Date()
		for (const document of documents) await this.repository.updateById(document._id.toString(), {
			storage_location: data.storage_location, inbound_date: inboundDate, updated_by: userId
		})
		this.eventBus.publish(new DefectiveGoodsChangedEvent(documents.map(({ _id }) => _id.toString()), { userCodeUpdated: username }))
		return { affected: documents.length }
	}
}
