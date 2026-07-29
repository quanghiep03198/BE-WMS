import { OnQueueEvent, QueueEventsHost, QueueEventsListener } from '@nestjs/bullmq'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { BULK_WRITE_INBOUND_EPCS_QUEUE } from '..'

@QueueEventsListener(BULK_WRITE_INBOUND_EPCS_QUEUE)
export class BulkWriteEpcsQueueEvents extends QueueEventsHost {
	constructor(@InjectPinoLogger(BulkWriteEpcsQueueEvents.name) private readonly logger: PinoLogger) {
		super()
	}

	@OnQueueEvent('completed')
	onQueueCompleted(job) {
		this.logger.debug(`Job "${job.name}" completed`)
	}

	@OnQueueEvent('failed')
	onQueueFailed(job) {
		this.logger.debug(`Job "${job.name}" failed`)
	}
}
