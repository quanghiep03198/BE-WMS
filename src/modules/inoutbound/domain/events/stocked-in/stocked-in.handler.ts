import { UpdateStockInDateCommand } from '@/modules/inoutbound/application/commands/update-stock-in-date/update-stock-in-date.command'
import { SYNC_INVENTORY_AUDIT_QUEUE } from '@/modules/inventory/constants'
import { InjectQueue } from '@nestjs/bullmq'
import { CommandBus, EventBus, EventsHandler, IEventHandler } from '@nestjs/cqrs'
import { Queue } from 'bullmq'
import { UpdateStockInDateFailedEvent } from '../update-stock-in-date-failed/update-stock-in-date-failed.event'
import { StockedInEvent } from './stocked-in.event'

@EventsHandler(StockedInEvent)
export class StockedInHandler implements IEventHandler<StockedInEvent> {
	constructor(
		// @InjectPinoLogger(StockedInHandler.name) private readonly logger: PinoLogger,
		@InjectQueue(SYNC_INVENTORY_AUDIT_QUEUE)
		private readonly syncInventoryAuditQueue: Queue<{ year: number; month: number }>,
		private readonly commandBus: CommandBus,
		private readonly eventBus: EventBus
	) {}

	async handle({ scannedEpcs }: StockedInEvent) {
		try {
			await this.commandBus.execute(new UpdateStockInDateCommand(scannedEpcs))
		} catch {
			this.eventBus.publish(new UpdateStockInDateFailedEvent('WH101', scannedEpcs))
		}
	}
}
