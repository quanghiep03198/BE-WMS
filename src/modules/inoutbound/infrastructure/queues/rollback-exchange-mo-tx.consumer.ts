import { Processor, WorkerHost } from '@nestjs/bullmq'
import { CommandBus } from '@nestjs/cqrs'
import { Job } from 'bullmq'
import { RollbackExchangeMoTransactionCommand } from '../../application/commands/rollback-exchange-mo-tx/rollback-exchange-mo-tx.command'
import { ROLLBACK_EXCHANGE_MO_TX_QUEUE } from '../constants/queue'

@Processor(ROLLBACK_EXCHANGE_MO_TX_QUEUE)
export class RollbackExchangeMoTransactionConsumer extends WorkerHost {
	constructor(private readonly commandBus: CommandBus) {
		super()
	}

	async process(job: Job<string[]>): Promise<void> {
		await this.commandBus.execute(new RollbackExchangeMoTransactionCommand(job.data))
	}
}
