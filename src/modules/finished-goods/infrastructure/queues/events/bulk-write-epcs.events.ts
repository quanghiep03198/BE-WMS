import { OnQueueEvent, QueueEventsHost, QueueEventsListener } from '@nestjs/bullmq'
import type { QueueEventsListener as IQueueEventsListener } from 'bullmq'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { BULK_WRITE_INBOUND_EPCS_QUEUE } from '..'

@QueueEventsListener(BULK_WRITE_INBOUND_EPCS_QUEUE)
export class BulkWriteEpcsQueueEvents extends QueueEventsHost {
	constructor(@InjectPinoLogger(BulkWriteEpcsQueueEvents.name) private readonly logger: PinoLogger) {
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
