import { DATA_SOURCE_DATA_LAKE } from '@databases/constants'
import { MssqlQueueGuard } from '@databases/mssql-availability/mssql-queue-guard.service'
import {
	FINISHED_GOODS_RMDBS_REPOSITORY,
	IFinishedGoodsAuditRepository
} from '@modules/finished-goods/application/ports/finished-goods-audit.repository.port'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Inject } from '@nestjs/common'
import { Job } from 'bullmq'
import { COMMIT_EXCHANGE_MO_QUEUE } from '..'

@Processor(COMMIT_EXCHANGE_MO_QUEUE)
export class CommitExchangeMoConsumer extends WorkerHost {
	constructor(
		@Inject(FINISHED_GOODS_RMDBS_REPOSITORY)
		private readonly repository: IFinishedGoodsAuditRepository,
		private readonly guard: MssqlQueueGuard
	) {
		super()
	}

	public async process(job: Job<{ pendingExchangeEpcs: string[]; targetMo: string }>, token?: string): Promise<void> {
		return this.guard.run(DATA_SOURCE_DATA_LAKE, job, token, async () => {
			const { pendingExchangeEpcs, targetMo } = job.data
			await this.repository.exchangeManufacturingOrder(pendingExchangeEpcs, targetMo)
		})
	}
}
