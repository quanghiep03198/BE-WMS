import {
	IIoMssqlRepository,
	IO_MSSQL_REPOSITORY
} from '@modules/finished-goods/application/ports/io-mssql.repository.port'
import { InventoryStorageType } from '@modules/finished-goods/domain/constants'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Inject } from '@nestjs/common'
import { Job } from 'bullmq'
import { COMMIT_STOCK_OUT_QUEUE } from '..'
import { StationNO } from '../../../domain/utils'

@Processor(COMMIT_STOCK_OUT_QUEUE)
export class CommitStockOutConsumer extends WorkerHost {
	constructor(@Inject(IO_MSSQL_REPOSITORY) private readonly ioMssqlRepository: IIoMssqlRepository) {
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
					inventory_variation_type: InventoryStorageType
					station_no: StationNO
				}>
			>,
			void
		>
	) {
		await this.ioMssqlRepository.commitStockOut(job.data)
	}
}
