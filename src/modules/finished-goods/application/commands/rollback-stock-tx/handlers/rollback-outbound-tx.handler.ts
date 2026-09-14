import { RolledBackOutboundTxEvent } from '@modules/finished-goods/domain/events/rolledback-stock-tx/impl/rolledback-outbound-tx.event'
import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs'
import { IStockTransactionRepository, STOCK_TX_REPOSITORY } from '../../../ports/stock-transaction.repository.port'
import { RollbackOutboundTxCommand } from '../impl/rollback-outbound-tx.command'

@CommandHandler(RollbackOutboundTxCommand)
export class RollbackOutboundTxHandler implements ICommandHandler<RollbackOutboundTxCommand> {
	constructor(
		@Inject(STOCK_TX_REPOSITORY) private readonly stockTxMongoRepository: IStockTransactionRepository,
		private readonly eventBus: EventBus
	) {}

	public async execute(command: RollbackOutboundTxCommand): Promise<void> {
		const rolledBackEpcs = await this.stockTxMongoRepository.rollbackOutboundTransaction(command.transactionId)
		this.eventBus.publish(new RolledBackOutboundTxEvent(rolledBackEpcs))
	}
}
