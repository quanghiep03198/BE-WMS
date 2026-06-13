import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import { InjectModel } from '@nestjs/mongoose'
import { Job } from 'bullmq'
import { PinoLogger } from 'nestjs-pino'
import { POST_DATA_INBOUND_QUEUE } from '../domain/constants'

import { PostReaderDataDTO } from '../application/dto/rfid-shared.dto'
import { RFIDSharedService } from '../application/services/rfid-shared.service'
import { EpcInbound, EpcModel } from '../infrastructure/schemas/epc.schema'

@Processor(POST_DATA_INBOUND_QUEUE, { concurrency: 2 })
export class RFIDInboundConsumer extends WorkerHost {
	constructor(
		private readonly logger: PinoLogger,
		@InjectModel(EpcInbound.name) private readonly epcModel: EpcModel,
		private readonly rfidSharedService: RFIDSharedService
	) {
		super()
	}

	/**
	 * @public
	 * @description Process the incoming data from the RFID reader
	 * @param {Job<PostReaderDataDTO, void, string>} job
	 */
	public async process(job: Job<PostReaderDataDTO, void, string>): Promise<void> {
		const { data, sn } = job.data
		return await this.rfidSharedService.bulkWriteRFIDData(this.epcModel, 'WH101', { data, sn })
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
