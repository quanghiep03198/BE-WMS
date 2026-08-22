import {
	IMssqlFinishedGoodsRepository,
	MSSQL_FINISHED_GOODS_REPOSITORY
} from '@modules/finished-goods/application/ports/mssql-finished-goods.repository.port'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Inject } from '@nestjs/common'
import { Job } from 'bullmq'
import { COMMIT_STOCK_BALANCES_QUEUE } from '..'
import { StationNO } from '../../../domain/utils'

@Processor(COMMIT_STOCK_BALANCES_QUEUE)
export class CommitStockBalancesConsumer extends WorkerHost {
	constructor(
		@Inject(MSSQL_FINISHED_GOODS_REPOSITORY) private readonly inoutboundMssqlRepository: IMssqlFinishedGoodsRepository
	) {
		super()
	}

	public async process(
		job: Job<
			Array<
				Array<{
					epc: string
					mo_no: string
					size_numcode: string
					factory_code: string
					status: string
					inventory_ledger_type: string
					dept_code: string
					dept_name: string
					storage: string
					station_no: StationNO
				}>
			>,
			void
		>
	) {
		await this.inoutboundMssqlRepository.commitStockFluctuation(job.data)
	}
}
