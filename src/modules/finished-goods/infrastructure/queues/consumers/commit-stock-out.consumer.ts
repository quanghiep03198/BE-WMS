import { DATA_SOURCE_DATA_LAKE } from '@databases/constants'
import { MssqlQueueGuard } from '@databases/mssql-availability/mssql-queue-guard.service'
import {
	FINISHED_GOODS_RMDBS_REPOSITORY,
	IFinishedGoodsAuditRepository
} from '@modules/finished-goods/application/ports/finished-goods-audit.repository.port'
import { StockTransactionPurpose } from '@modules/finished-goods/domain/constants'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Inject } from '@nestjs/common'
import { Job } from 'bullmq'
import { COMMIT_STOCK_OUT_QUEUE } from '..'
import { StationNO } from '../../../domain/utils'

@Processor(COMMIT_STOCK_OUT_QUEUE)
export class CommitStockOutConsumer extends WorkerHost {
	constructor(
		@Inject(FINISHED_GOODS_RMDBS_REPOSITORY)
		private readonly repository: IFinishedGoodsAuditRepository,
		private readonly guard: MssqlQueueGuard
	) {
		super()
	}

	public async process(
		job: Job<
			Array<
				Array<{
					epc: string
					mo_no: string
					po: string
					size_numcode: string
					factory_code: string
					status: string
					purpose: StockTransactionPurpose
					station_no: StationNO
				}>
			>,
			void
		>,
		token?: string
	) {
		return this.guard.run(DATA_SOURCE_DATA_LAKE, job, token, () => this.repository.commitStockOut(job.data))
	}
}
