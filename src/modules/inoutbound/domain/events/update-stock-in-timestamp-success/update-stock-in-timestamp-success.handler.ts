import { InoutboundGateway } from '@/modules/inoutbound/presentation/gateways/inoutbound.gateway'
import { EventsHandler, IEventHandler } from '@nestjs/cqrs'
import { UpdateStockInTimestampSuccessEvent } from './update-stock-in-timestamp-success.event'

@EventsHandler(UpdateStockInTimestampSuccessEvent)
export class UpdateStockInTimestampSuccessHandler implements IEventHandler<UpdateStockInTimestampSuccessEvent> {
	constructor(private readonly inoutboundGateway: InoutboundGateway) {}

	public async handle() {
		this.inoutboundGateway.server.emit(
			'inoutbound.stocked_in',
			'Stocked in successfully. Inventory audit data will be synced in the background.'
		)
	}
}
