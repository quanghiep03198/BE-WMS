import { CommitStockInFailureEvent } from '@modules/finished-goods/domain/events/commit-stock-in-failure/commit-stock-in-failure.event'
import { CommitedStockIn } from '@modules/finished-goods/domain/events/committed-stock-in/commited-stock-in.event'
import { STOCK_IN_QUEUE } from '@modules/finished-goods/infrastructure/constants/queue'
import { InjectQueue } from '@nestjs/bullmq'
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs'
import { Queue } from 'bullmq'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { CommitStockInCommand } from './commit-stock-in.command'

@CommandHandler(CommitStockInCommand)
export class CommitStockInHandler implements ICommandHandler<CommitStockInCommand> {
	constructor(
		@InjectPinoLogger(CommitStockInHandler.name) private readonly logger: PinoLogger,
		@InjectQueue(STOCK_IN_QUEUE) private readonly stockInQueue: Queue,
		private readonly eventBus: EventBus
	) {}

	public async execute({ pendingInboundEpcs }: CommitStockInCommand): Promise<void> {
		try {
			await this.stockInQueue.add(CommitStockInCommand.name, pendingInboundEpcs)
			this.eventBus.publish(new CommitedStockIn(pendingInboundEpcs.length))
		} catch (error) {
			this.logger.error(error)
			this.eventBus.publish(new CommitStockInFailureEvent('WH101', pendingInboundEpcs))
		}
	}
}
