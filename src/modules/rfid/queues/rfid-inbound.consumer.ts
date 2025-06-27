import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import { Inject } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Job } from 'bullmq'
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston'
import { Logger } from 'winston'
import { POST_DATA_INBOUND_QUEUE } from '../constants'
import { PostReaderDataDTO } from '../dto/rfid.dto'
import { EpcInbound, EpcModel } from '../schemas/epc.schema'
import { RFIDSharedService } from '../services/rfid-shared.service'

@Processor(POST_DATA_INBOUND_QUEUE, { concurrency: 2 })
export class RFIDInboundConsumer extends WorkerHost {
	constructor(
		@Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
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
		this.logger.log('info', `Job "${job.name}" completed`)
	}

	@OnWorkerEvent('failed')
	onWorkerFailed(job: Job) {
		this.logger.log('error', `Job "${job.name}" failed: ${job.failedReason}`)
	}
}
