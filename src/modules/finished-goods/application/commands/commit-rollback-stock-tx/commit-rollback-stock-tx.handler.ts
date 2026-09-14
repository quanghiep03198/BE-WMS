import { ROLLBACK_STOCK_TX_QUEUE } from '@modules/finished-goods/infrastructure/queues'
import { InjectQueue } from '@nestjs/bullmq'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { Queue } from 'bullmq'
import { CommitRollbackStockTxCommand } from './commit-rollback-stock-tx.command'

@CommandHandler(CommitRollbackStockTxCommand)
export class CommitRollbackStockTxHandler implements ICommandHandler<CommitRollbackStockTxCommand> {
	constructor(
		@InjectQueue(ROLLBACK_STOCK_TX_QUEUE)
		private readonly rollbackInboundTxQueue: Queue<CommitRollbackStockTxCommand['rolledBackEpcs']>
	) {}

	public async execute(command: CommitRollbackStockTxCommand): Promise<void> {
		await this.rollbackInboundTxQueue.add('ROLLBACK_INBOUND_TX', command.rolledBackEpcs)
	}
}
