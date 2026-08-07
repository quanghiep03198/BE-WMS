import { OnQueueEvent, QueueEventsHost, QueueEventsListener } from '@nestjs/bullmq'
import { CompletedEventArgs } from 'bullmq'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { COMMIT_EXCHANGE_MO_QUEUE } from '..'

@QueueEventsListener(COMMIT_EXCHANGE_MO_QUEUE)
export class CommitExchangeMoQueueEvent extends QueueEventsHost {
	constructor(@InjectPinoLogger(CommitExchangeMoQueueEvent.name) private readonly logger: PinoLogger) {
		super()
	}

	@OnQueueEvent('completed')
	onCompleted(job: CompletedEventArgs) {
		this.logger.debug(`Job "${job.jobId}" completed successfully`)
	}

	@OnQueueEvent('error')
	onError(error) {
		this.logger.error(error)
	}
}
