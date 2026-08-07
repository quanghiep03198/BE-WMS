import { OnQueueEvent, QueueEventsHost, QueueEventsListener } from '@nestjs/bullmq'
import type { CompletedEventArgs, ErrorEventArgs } from 'bullmq'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { COMMIT_STOCK_VARIATION_QUEUE } from '..'

@QueueEventsListener(COMMIT_STOCK_VARIATION_QUEUE)
export class CommitStockVariationQueueEvent extends QueueEventsHost {
	constructor(@InjectPinoLogger(CommitStockVariationQueueEvent.name) private readonly logger: PinoLogger) {
		super()
	}

	@OnQueueEvent('completed')
	onCompleted({ jobId }: CompletedEventArgs) {
		this.logger.debug(`Job "${jobId}" completed successfully`)
	}

	@OnQueueEvent('error')
	onFailed(error: ErrorEventArgs) {
		this.logger.error(error)
	}
}
