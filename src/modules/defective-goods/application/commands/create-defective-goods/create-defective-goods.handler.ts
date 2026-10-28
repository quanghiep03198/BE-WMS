import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { DefectiveGoodsChangedEvent } from '../../../domain/events/defective-goods.events'
import { DEFECTIVE_GOODS_REPOSITORY, IDefectiveGoodsRepository } from '../../ports/defective-goods.repository.port'
import { CreateDefectiveGoodsCommand } from './create-defective-goods.command'

@CommandHandler(CreateDefectiveGoodsCommand)
export class CreateDefectiveGoodsHandler implements ICommandHandler<CreateDefectiveGoodsCommand> {
	constructor(
		@InjectPinoLogger(CreateDefectiveGoodsHandler.name)
		private readonly logger: PinoLogger,
		@Inject(DEFECTIVE_GOODS_REPOSITORY) private readonly repository: IDefectiveGoodsRepository,
		private readonly eventBus: EventBus
	) {}

	async execute({ items, username }: CreateDefectiveGoodsCommand) {
		this.logger.debug(items)

		const records = await this.repository.insertMany(items)
		const event = new DefectiveGoodsChangedEvent(
			records.map(({ _id }) => _id.toString()),
			{ userCodeCreated: username }
		)
		this.eventBus.publish(event)
		return records
	}
}
