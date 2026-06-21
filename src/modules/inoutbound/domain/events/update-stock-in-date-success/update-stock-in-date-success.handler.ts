import { InoutboundGateway } from '@/modules/inoutbound/presentation/gateways/inoutbound.gateway'
import { EventsHandler, IEventHandler } from '@nestjs/cqrs'
import { UpdateStockInDateSuccessEvent } from './update-stock-in-date-success.event'

@EventsHandler(UpdateStockInDateSuccessEvent)
export class UpdateStockInDateSuccessEventHandler implements IEventHandler<UpdateStockInDateSuccessEvent> {
	constructor(private readonly inoutboundGateway: InoutboundGateway) {}

	public async handle() {
		this.inoutboundGateway.server.emit(
			'inoutbound.stocked_in',
			'Stocked in successfully. Inventory audit data will be synced in the background.'
		)
	}
}
