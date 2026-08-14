import { OnQueueEvent, QueueEventsHost, QueueEventsListener } from '@nestjs/bullmq'
// Aliased because `QueueEventsListener` from '@nestjs/bullmq' is the decorator

import type { QueueEventsListener as IQueueEventsListener } from 'bullmq'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { COMMIT_UPSERT_EPC_MATCH_QUEUE } from '..'

// Use the generic to type the event payload with your job's return value

@QueueEventsListener(COMMIT_UPSERT_EPC_MATCH_QUEUE)
export class CommitUpsertEpcsMatchQueueEvent extends QueueEventsHost {
	constructor(@InjectPinoLogger(CommitUpsertEpcsMatchQueueEvent.name) private readonly logger: PinoLogger) {
		super()
	}

	@OnQueueEvent('completed')
	onCompleted({ jobId }: FirstParameter<IQueueEventsListener['completed']>) {
		this.logger.info(`Job "${jobId}" completed successfully`)
	}

	@OnQueueEvent('error')
	onError(error: FirstParameter<IQueueEventsListener['error']>) {
		this.logger.error(error)
	}

	@OnQueueEvent('failed')
	onFailed({ jobId, failedReason }: FirstParameter<IQueueEventsListener['failed']>) {
		this.logger.error(`Job "${jobId}" failed with reason: ${failedReason}`)
	}
}
