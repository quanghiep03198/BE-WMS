import {
	IIoMssqlRepository,
	IO_MSSQL_REPOSITORY
} from '@modules/finished-goods/application/ports/io-mssql.repository.port'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Inject } from '@nestjs/common'
import { Job } from 'bullmq'
import { COMMIT_EXCHANGE_MO_QUEUE } from '..'

@Processor(COMMIT_EXCHANGE_MO_QUEUE)
export class CommitExchangeMoConsumer extends WorkerHost {
	constructor(
		@Inject(IO_MSSQL_REPOSITORY)
		private readonly ioMssqlRepository: IIoMssqlRepository
	) {
		super()
	}

	public async process(job: Job<{ pendingExchangeEpcs: string[]; targetMo: string }>): Promise<void> {
		const { pendingExchangeEpcs, targetMo } = job.data
		await this.ioMssqlRepository.exchangeManufacturingOrder(pendingExchangeEpcs, targetMo)
	}
}
