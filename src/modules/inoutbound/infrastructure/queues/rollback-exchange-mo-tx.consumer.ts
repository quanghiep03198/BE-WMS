import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Inject } from '@nestjs/common'
import { Job } from 'bullmq'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { IIoMssqlRepository, IO_MSSQL_REPOSITORY } from '../../application/ports/io-mssql.repository.port'
import { ROLLBACK_EXCHANGE_MO_TX_QUEUE } from '../constants/queue'

@Processor(ROLLBACK_EXCHANGE_MO_TX_QUEUE)
export class RollbackExchangeMoTransactionConsumer extends WorkerHost {
	constructor(
		@InjectPinoLogger(RollbackExchangeMoTransactionConsumer.name) private readonly logger: PinoLogger,
		@Inject(IO_MSSQL_REPOSITORY)
		private readonly inoutboundMssqlRepository: IIoMssqlRepository
	) {
		super()
	}

	public async process(job: Job<string[]>): Promise<void> {
		await this.inoutboundMssqlRepository.rollbackExchangeMoTransaction(job.data)
		this.logger.info(`Rolled back exchange MO transaction for ${job.data.length} SKUs`)
	}
}
