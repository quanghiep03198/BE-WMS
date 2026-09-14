import {
	FINISHED_GOODS_RMDBS_REPOSITORY,
	IFinishedGoodsRmdbsRepository
} from '@modules/finished-goods/application/ports/finished-goods.rmdbs.repository.port'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Inject } from '@nestjs/common'
import { Job } from 'bullmq'
import { COMMIT_EXCHANGE_MO_QUEUE } from '..'

@Processor(COMMIT_EXCHANGE_MO_QUEUE)
export class CommitExchangeMoConsumer extends WorkerHost {
	constructor(
		@Inject(FINISHED_GOODS_RMDBS_REPOSITORY)
		private readonly mssqlFinishedGoodsRepository: IFinishedGoodsRmdbsRepository
	) {
		super()
	}

	public async process(job: Job<{ pendingExchangeEpcs: string[]; targetMo: string }>): Promise<void> {
		const { pendingExchangeEpcs, targetMo } = job.data
		await this.mssqlFinishedGoodsRepository.exchangeManufacturingOrder(pendingExchangeEpcs, targetMo)
	}
}
