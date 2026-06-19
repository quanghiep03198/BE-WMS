import { SYNC_INVENTORY_AUDIT_QUEUE } from '@/modules/inventory/constants'
import { InjectQueue } from '@nestjs/bullmq'
import { EventsHandler, IEventHandler } from '@nestjs/cqrs'
import { Queue } from 'bullmq'
import { format } from 'date-fns'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { StockedInEvent } from './stocked-in.event'

@EventsHandler(StockedInEvent)
export class StockedInHandler implements IEventHandler<StockedInEvent> {
	constructor(
		@InjectPinoLogger(StockedInHandler.name) private readonly logger: PinoLogger,
		@InjectQueue(SYNC_INVENTORY_AUDIT_QUEUE) private readonly syncInventoryAuditQueue: Queue
	) {}

	handle(): void {
		// this.logger.debug('[StockedInEvent] handled with data:>>', scannedEpcs)
		this.syncInventoryAuditQueue.add(
			'sync_inventory_audit_data',
			{ year: new Date().getFullYear(), month: new Date().getMonth() + 1 },
			{
				jobId: format(new Date(), 'yyyy-MM'),
				removeOnComplete: true,
				removeOnFail: true
			}
		)
	}
}
