import { RolledBackInboundTxEvent } from '@modules/finished-goods/domain/events/rolledback-stock-tx/impl/rolledback-inbound-tx.event'
import { ORDER_REPOSITORY } from '@modules/order/order.constant'
import { IOrderRepository } from '@modules/order/order.repository.interface'
import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs'
import { IStockTransactionRepository, STOCK_TX_REPOSITORY } from '../../../ports/stock-transaction.repository.port'
import { RollbackInboundTxCommand } from '../impl/rollback-inbound-tx.command'

@CommandHandler(RollbackInboundTxCommand)
export class RollbackInboundTxHandler implements ICommandHandler<RollbackInboundTxCommand> {
	constructor(
		@Inject(STOCK_TX_REPOSITORY) private readonly stockTxMongoRepository: IStockTransactionRepository,
		@Inject(ORDER_REPOSITORY) private readonly orderRepository: IOrderRepository,
		private readonly eventBus: EventBus
	) {}

	public async execute(command: RollbackInboundTxCommand): Promise<void> {
		const rolledBackEpcs = await this.stockTxMongoRepository.rollbackInboundTransaction(command.transactionId)
		this.eventBus.publish(new RolledBackInboundTxEvent(rolledBackEpcs))
	}
}
