import {
	IMssqlFinishedGoodsRepository,
	MSSQL_FINISHED_GOODS_REPOSITORY
} from '@modules/finished-goods/application/ports/mssql-finished-goods.repository.port'
import { InventoryStorageType } from '@modules/finished-goods/domain/constants'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Inject } from '@nestjs/common'
import { Job } from 'bullmq'
import { COMMIT_STOCK_OUT_QUEUE } from '..'
import { StationNO } from '../../../domain/utils'

@Processor(COMMIT_STOCK_OUT_QUEUE)
export class CommitStockOutConsumer extends WorkerHost {
	constructor(
		@Inject(MSSQL_FINISHED_GOODS_REPOSITORY)
		private readonly mssqlFinishedGoodsRepository: IMssqlFinishedGoodsRepository
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
					inventory_ledger_type: InventoryStorageType
					station_no: StationNO
				}>
			>,
			void
		>
	) {
		await this.mssqlFinishedGoodsRepository.commitStockOut(job.data)
	}
}
