import { OnQueueEvent, QueueEventsHost, QueueEventsListener } from '@nestjs/bullmq'
import { CompletedEventArgs, ErrorEventArgs } from 'bullmq'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { COMMIT_STOCK_OUT_QUEUE } from '..'

@QueueEventsListener(COMMIT_STOCK_OUT_QUEUE)
export class CommitStockOutQueueEvent extends QueueEventsHost {
	constructor(@InjectPinoLogger(CommitStockOutQueueEvent.name) private readonly logger: PinoLogger) {
		super()
	}

	@OnQueueEvent('completed')
	onCompleted({ jobId }: CompletedEventArgs) {
		this.logger.debug(`Job "${jobId}" completed successfully`)
	}

	@OnQueueEvent('error')
	onError(error: ErrorEventArgs) {
		this.logger.error(error)
	}
}
