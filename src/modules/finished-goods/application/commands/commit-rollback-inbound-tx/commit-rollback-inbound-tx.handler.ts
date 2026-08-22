import { ROLLBACK_INBOUND_TX_QUEUE } from '@modules/finished-goods/infrastructure/queues'
import { InjectQueue } from '@nestjs/bullmq'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { Queue } from 'bullmq'
import { CommitRollbackInboundTxCommand } from './commit-rollback-inbound-tx.command'

@CommandHandler(CommitRollbackInboundTxCommand)
export class CommitRollbackInboundTxHandler implements ICommandHandler<CommitRollbackInboundTxCommand> {
	constructor(
		@InjectQueue(ROLLBACK_INBOUND_TX_QUEUE)
		private readonly rollbackInboundTxQueue: Queue<CommitRollbackInboundTxCommand['rolledBackEpcs']>
	) {}

	public async execute(command: CommitRollbackInboundTxCommand): Promise<void> {
		await this.rollbackInboundTxQueue.add('ROLLBACK_INBOUND_TX', command.rolledBackEpcs)
	}
}
