import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { PinoLogger } from 'nestjs-pino'
import { BULK_WRITE_OUTBOUND_EPCS_QUEUE } from '..'

import { BulkWriteInventoryCommand } from '@modules/finished-goods/application/commands/bulk-write-inventory/bulk-write-inventory.command'
import { PostReaderDataDTO } from '@modules/finished-goods/presentation/dto/rfid-shared.dto'
import { CommandBus } from '@nestjs/cqrs'

@Processor(BULK_WRITE_OUTBOUND_EPCS_QUEUE, { concurrency: 2 })
export class BulkWriteOutboundEpcsConsumer extends WorkerHost {
	constructor(
		private readonly logger: PinoLogger,
		private readonly commandBus: CommandBus
	) {
		super()
	}

	/**
	 * @public
	 * @description Process the incoming data from the RFID reader
	 * @param {Job<PostReaderDataDTO, void, string>} job
	 */
	public async process(job: Job<PostReaderDataDTO, void, string>): Promise<void> {
		return await this.commandBus.execute(new BulkWriteInventoryCommand({ action: 'outbound', payload: job.data }))
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
