import { RolledBackInboundTxEvent } from '@modules/finished-goods/domain/events/rolledback-inbound-tx/rolledback-inbound-tx.event'
import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs'
import {
	IStockTransactionMongoRepository,
	STOCK_TX_MONGO_REPOSITORY
} from '../../ports/stock-transaction-mongo.repository.port'
import { RollbackStockInTxCommand } from './rollback-inbound-tx.command'

@CommandHandler(RollbackStockInTxCommand)
export class RollbackInboundTxHandler implements ICommandHandler<RollbackStockInTxCommand> {
	constructor(
		@Inject(STOCK_TX_MONGO_REPOSITORY) private readonly stockTxMongoRepository: IStockTransactionMongoRepository,
		private readonly eventBus: EventBus
	) {}

	public async execute(command: RollbackStockInTxCommand): Promise<void> {
		const rolledBackEpcs = await this.stockTxMongoRepository.rollbackInboundTransaction(command.transactionId)
		this.eventBus.publish(new RolledBackInboundTxEvent(rolledBackEpcs))
	}
}
