import { ROLLBACK_STOCK_TX_QUEUE } from '@/modules/inoutbound/infrastructure/constants/queue'
import { InjectQueue } from '@nestjs/bullmq'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { Queue } from 'bullmq'
import { RollbackStockTransactionCommand } from './rollback-stock-tx.command'

@CommandHandler(RollbackStockTransactionCommand)
export class RollbackStockTransactionHandler implements ICommandHandler<RollbackStockTransactionCommand> {
	constructor(@InjectQueue(ROLLBACK_STOCK_TX_QUEUE) private readonly rollbackStockTxQueue: Queue) {}

	public async execute(command: RollbackStockTransactionCommand): Promise<void> {
		this.rollbackStockTxQueue.add('ROLLBACK_STOCK_TX', command)
	}
}
