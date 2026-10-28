import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs'
import { DefectiveGoodsChangedEvent } from '../../../domain/events/defective-goods.events'
import { DEFECTIVE_GOODS_REPOSITORY, IDefectiveGoodsRepository } from '../../ports/defective-goods.repository.port'
import { StockInDefectiveGoodsCommand } from './stock-in.command'

@CommandHandler(StockInDefectiveGoodsCommand)
export class StockInDefectiveGoodsHandler implements ICommandHandler<StockInDefectiveGoodsCommand> {
	constructor(
		@Inject(DEFECTIVE_GOODS_REPOSITORY) private readonly repository: IDefectiveGoodsRepository,
		private readonly eventBus: EventBus
	) {}
	async execute({ data, user }: StockInDefectiveGoodsCommand) {
		const stockedInEpcs = await this.repository.stockIn(data, user)
		this.eventBus.publish(
			new DefectiveGoodsChangedEvent(
				stockedInEpcs.map((item) => item._id.toHexString()),
				{ userCodeUpdated: user.username }
			)
		)
	}
}
