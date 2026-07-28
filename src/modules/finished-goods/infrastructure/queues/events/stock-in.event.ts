import { ElectronicProductCode } from '@modules/finished-goods/domain/value-objects/epc.vo'
import { OnQueueEvent, QueueEventsHost, QueueEventsListener } from '@nestjs/bullmq'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { BULK_WRITE_INBOUND_EPCS_QUEUE } from '../constants'

@QueueEventsListener(BULK_WRITE_INBOUND_EPCS_QUEUE)
export class StockInQueueEvent extends QueueEventsHost {
	constructor(@InjectPinoLogger(StockInQueueEvent.name) private readonly logger: PinoLogger) {
		super()
	}

	@OnQueueEvent('completed')
	onQueueCompleted(job: { data: Array<ElectronicProductCode> }) {
		this.logger.debug(job.data.map((epc) => epc.getStockKeepingUnit()))
	}

	@OnQueueEvent('failed')
	onQueueFailed(job) {
		this.logger.debug(`Job "${job.name}" failed`)
	}
}
