import {
	IIoMssqlRepository,
	IO_MSSQL_REPOSITORY
} from '@modules/finished-goods/application/ports/io-mssql.repository.port'
import { ElectronicProductCode } from '@modules/finished-goods/domain/value-objects/epc.vo'
import { OnQueueEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import { Inject } from '@nestjs/common'
import { Job } from 'bullmq'
import { STOCK_IN_QUEUE } from '../constants/queue'

@Processor(STOCK_IN_QUEUE, { concurrency: 5 })
export class StockInConsumer extends WorkerHost {
	constructor(@Inject(IO_MSSQL_REPOSITORY) private readonly inoutboundMssqlRepository: IIoMssqlRepository) {
		super()
	}

	public async process(job: Job<Array<ElectronicProductCode>, void>) {
		await this.inoutboundMssqlRepository.stockIn(job.data)
	}

	@OnQueueEvent('completed')
	public async onCompleted(job: Job<Array<ElectronicProductCode>, void>) {
		console.log(`Job ${job.id} completed successfully`)
	}
}
