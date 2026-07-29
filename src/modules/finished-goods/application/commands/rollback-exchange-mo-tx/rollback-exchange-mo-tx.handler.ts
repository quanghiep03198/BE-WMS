import { ROLLBACK_EXCHANGE_MO_TX_QUEUE } from '@modules/finished-goods/infrastructure/queues'
import { InjectQueue } from '@nestjs/bullmq'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { Queue } from 'bullmq'
import { RollbackExchangeMoTransactionCommand } from './rollback-exchange-mo-tx.command'

@CommandHandler(RollbackExchangeMoTransactionCommand)
export class RollbackExchangeMoTransactionHandler implements ICommandHandler<RollbackExchangeMoTransactionCommand> {
	constructor(@InjectQueue(ROLLBACK_EXCHANGE_MO_TX_QUEUE) private readonly rollbackExchangeMoTxQueue: Queue) {}

	public async execute({ exchangedEpcs: exchangeSkus }: RollbackExchangeMoTransactionCommand) {
		this.rollbackExchangeMoTxQueue.add('ROLLBACK_EXCHANGE_MO_TX', exchangeSkus)
	}
}
