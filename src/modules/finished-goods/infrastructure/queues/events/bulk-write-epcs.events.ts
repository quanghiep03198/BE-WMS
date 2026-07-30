import { PostReaderDataDTO } from '@modules/finished-goods/presentation/dto/rfid-shared.dto'
import { OnQueueEvent, QueueEventsHost, QueueEventsListener } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { BULK_WRITE_INBOUND_EPCS_QUEUE } from '..'

@QueueEventsListener(BULK_WRITE_INBOUND_EPCS_QUEUE)
export class BulkWriteEpcsQueueEvents extends QueueEventsHost {
	constructor(@InjectPinoLogger(BulkWriteEpcsQueueEvents.name) private readonly logger: PinoLogger) {
		super()
	}

	@OnQueueEvent('completed')
	onQueueCompleted(job: Job<PostReaderDataDTO, void, string>) {
		this.logger.info(`Job "${job.name}" completed with ${job.data?.data?.tagList?.length ?? 0} EPCs`)
	}

	@OnQueueEvent('failed')
	onQueueFailed(job) {
		this.logger.info(`Job "${job.name}" failed`)
	}
}
