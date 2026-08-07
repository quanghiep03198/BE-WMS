import { StationNO } from '@modules/finished-goods/domain/utils'
import { OnQueueEvent, QueueEventsHost, QueueEventsListener } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { COMMIT_STOCK_VARIATION_QUEUE } from '..'

@QueueEventsListener(COMMIT_STOCK_VARIATION_QUEUE)
export class CommitStockVariationQueueEvent extends QueueEventsHost {
	constructor(@InjectPinoLogger(CommitStockVariationQueueEvent.name) private readonly logger: PinoLogger) {
		super()
	}

	@OnQueueEvent('completed')
	onQueueCompleted(
		job: Job<
			Array<
				Array<{
					epc: string
					mo_no: string
					size_numcode: string
					factory_code: string
					status: string
					inventory_variation_type: string
					dept_code: string
					dept_name: string
					storage: string
					station_no: StationNO
				}>
			>,
			void
		>
	) {
		const stockedInQty = job.data.flat().length
		this.logger.debug(`Completed with ${stockedInQty} EPCs stocked in`)
	}

	@OnQueueEvent('failed')
	onQueueFailed(job) {
		this.logger.debug(`Job "${job.name}" failed`)
	}
}
