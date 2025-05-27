import { FileLogger } from '@/common/helpers/file-logger.helper'
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import { InjectModel } from '@nestjs/mongoose'
import { Job } from 'bullmq'
import { POST_DATA_OUTBOUND_QUEUE } from '../constants'
import { PostReaderDataDTO } from '../dto/rfid.dto'
import { EpcModel, EpcOutbound } from '../schemas/epc.schema'
import { RFIDSharedService } from '../services/rfid-shared.service'

@Processor(POST_DATA_OUTBOUND_QUEUE, { concurrency: 2 })
export class RFIDOutboundConsumer extends WorkerHost {
	constructor(
		@InjectModel(EpcOutbound.name) private readonly epcModel: EpcModel,
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
		FileLogger.info(`Job "${job.name}" completed`)
	}

	@OnWorkerEvent('failed')
	onWorkerFailed(job: Job) {
		FileLogger.error(`Job "${job.name}" failed: ${job.failedReason}`)
	}
}
