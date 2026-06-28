import { UpdateStockInDateCommand } from '@/modules/inoutbound/application/commands/update-stock-in-date/update-stock-in-date.command'
import { CommandBus, EventBus, EventsHandler, IEventHandler } from '@nestjs/cqrs'
import { UpdateStockInDateFailedEvent } from '../update-stock-in-date-failed/update-stock-in-date-failed.event'
import { StockedInEvent } from './stocked-in.event'

@EventsHandler(StockedInEvent)
export class StockedInHandler implements IEventHandler<StockedInEvent> {
	constructor(
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
