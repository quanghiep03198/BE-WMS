import { OnQueueEvent, QueueEventsHost, QueueEventsListener } from '@nestjs/bullmq'
import { BULK_WRITE_INBOUND_EPCS_QUEUE } from '../../constants/queue'

@QueueEventsListener(BULK_WRITE_INBOUND_EPCS_QUEUE)
export class BulkWriteEpcsQueueEvents extends QueueEventsHost {
	@OnQueueEvent('completed')
	onQueueCompleted(job) {
		console.log(`Job "${job.name}" completed`)
	}
}
