import { OnQueueEvent, QueueEventsHost, QueueEventsListener } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { COMMIT_EXCHANGE_MO_QUEUE } from '..'

@QueueEventsListener(COMMIT_EXCHANGE_MO_QUEUE)
export class CommitExchangeMoQueueEvent extends QueueEventsHost {
	constructor(@InjectPinoLogger(CommitExchangeMoQueueEvent.name) private readonly logger: PinoLogger) {
		super()
	}

	@OnQueueEvent('completed')
	onQueueCompleted(job: Job<{ pendingExchangeEpcs: string[]; targetMo: string }>) {
		const { pendingExchangeEpcs, targetMo } = job.data
		this.logger.debug(
			`Job "${job.name}" completed successfully with ${pendingExchangeEpcs.length} exchanged EPCs for target MO "${targetMo}"`
		)
	}

	@OnQueueEvent('failed')
	onQueueFailed(job) {
		this.logger.debug(`Job "${job.name}" failed`)
	}
}
