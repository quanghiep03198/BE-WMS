import { InventoryStorageType } from '@modules/finished-goods/domain/constants'
import { StationNO } from '@modules/finished-goods/domain/utils'
import { OnQueueEvent, QueueEventsHost, QueueEventsListener } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { COMMIT_STOCK_OUT_QUEUE } from '..'

@QueueEventsListener(COMMIT_STOCK_OUT_QUEUE)
export class CommitStockOutQueueEvent extends QueueEventsHost {
	constructor(@InjectPinoLogger(CommitStockOutQueueEvent.name) private readonly logger: PinoLogger) {
		super()
	}

	@OnQueueEvent('completed')
	onQueueCompleted(
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
		const stockedOutQty = job.data.flat().length
		this.logger.debug(`Completed with ${stockedOutQty} EPCs stocked out`)
	}

	@OnQueueEvent('failed')
	onQueueFailed(job) {
		this.logger.debug(`Job "${job.name}" failed`)
	}
}
