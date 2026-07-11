import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Inject } from '@nestjs/common'
import { Job } from 'bullmq'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { IIoMssqlRepository, IO_MSSQL_REPOSITORY } from '../../application/ports/io-mssql.repository.port'
import { ElectronicProductCode } from '../../domain/value-objects/epc.vo'
import { ROLLBACK_STOCK_TX_QUEUE } from '../constants/queue'

@Processor(ROLLBACK_STOCK_TX_QUEUE)
export class RollbackStockInTransactionConsumer extends WorkerHost {
	constructor(
		@InjectPinoLogger(RollbackStockInTransactionConsumer.name) private readonly logger: PinoLogger,
		@Inject(IO_MSSQL_REPOSITORY) private readonly inoutboundMssqlRepository: IIoMssqlRepository
	) {
		super()
	}

	public async process(
		job: Job<{ stationNo: 'WH101' | 'WH103'; movedSkus: Array<ElectronicProductCode> }>
	): Promise<void> {
		const { stationNo, movedSkus } = job.data
		await this.inoutboundMssqlRepository.rollbackStockTransaction(stationNo, movedSkus)
		this.logger.info(`Rolled back stock transaction for ${movedSkus.length} SKUs at station ${stationNo}`)
	}
}
