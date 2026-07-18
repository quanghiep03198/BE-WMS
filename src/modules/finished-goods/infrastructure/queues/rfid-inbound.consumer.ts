import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import { CommandBus } from '@nestjs/cqrs'
import { Job } from 'bullmq'
import { PinoLogger } from 'nestjs-pino'
import { BulkWriteInventoryCommand } from '../../application/commands/bulk-write-inventory/bulk-write-inventory.command'
import { PostReaderDataDTO } from '../../presentation/dto/rfid-shared.dto'
import { POST_DATA_INBOUND_QUEUE } from '../constants/queue'

@Processor(POST_DATA_INBOUND_QUEUE, { concurrency: 2 })
export class RFIDInboundConsumer extends WorkerHost {
	constructor(
		private readonly logger: PinoLogger,

		private readonly commandBus: CommandBus
		// private readonly rfidSharedService: RFIDSharedService
	) {
		super()
	}

	/**
	 * @public
	 * @description Process the incoming data from the RFID reader
	 * @param {Job<PostReaderDataDTO, void, string>} job
	 */
	public async process(job: Job<PostReaderDataDTO, void, string>): Promise<void> {
		const start = performance.now()
		const result = await this.commandBus.execute(
			new BulkWriteInventoryCommand({ action: 'inbound', payload: job.data })
		)
		const end = performance.now()
		this.logger.debug(`Job "${job.name}" processed in ${end - start} ms`)
		return result
	}

	@OnWorkerEvent('completed')
	onWorkerCompleted(job: Job) {
		this.logger.info(`Job "${job.name}" completed`)
	}

	@OnWorkerEvent('failed')
	onWorkerFailed(job: Job) {
		this.logger.error(`Job "${job.name}" failed: ${job.failedReason}`)
	}
}
