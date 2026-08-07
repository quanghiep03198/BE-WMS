import { OnQueueEvent, QueueEventsHost, QueueEventsListener } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { COMMIT_STOCK_VARIATION_QUEUE } from '..'

@QueueEventsListener(COMMIT_STOCK_VARIATION_QUEUE)
export class CommitUpsertEpcsMatchQueueEvent extends QueueEventsHost {
	constructor(@InjectPinoLogger(CommitUpsertEpcsMatchQueueEvent.name) private readonly logger: PinoLogger) {
		super()
	}

	@OnQueueEvent('completed')
	onQueueCompleted(job: Job<{ pendingExchangeEpcs: string[]; targetMo: string }>) {
		const { pendingExchangeEpcs, targetMo } = job.data
		this.logger.debug(
			`Job "${job.name}" completed successfully with ${pendingExchangeEpcs.length} upserted EPCs for target MO "${targetMo}"`
		)
	}

	@OnQueueEvent('failed')
	onQueueFailed(job) {
		this.logger.debug(`Job "${job.name}" failed`)
	}
}
