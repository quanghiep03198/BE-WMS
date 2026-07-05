import { CommandBus, EventBus, EventsHandler, IEventHandler } from '@nestjs/cqrs'
import { StockedInEvent } from './stocked-in.event'

@EventsHandler(StockedInEvent)
export class StockedInEventHandler implements IEventHandler<StockedInEvent> {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly eventBus: EventBus
	) {}

	async handle({ scannedEpcs }: StockedInEvent) {
		// try {
		// 	await this.commandBus.execute(new UpdateStockInDateCommand(scannedEpcs))
		// } catch {
		// 	this.eventBus.publish(new UpdateStockInDateFailedEvent('WH101', scannedEpcs))
		// }
	}
}
