import { Inject } from '@nestjs/common'
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs'
import {
	ITruckloadDeliveryRepository,
	TRUCKLOAD_DELIVERY_REPOSITORY
} from '../../ports/truckload-delivery.repository.port'
import { RemovePurchaseOrderCommand } from './remove-purchase-order.command'

@CommandHandler(RemovePurchaseOrderCommand)
export class RemovePurchaseOrderHandler implements ICommandHandler<RemovePurchaseOrderCommand, void> {
	constructor(
		@Inject(TRUCKLOAD_DELIVERY_REPOSITORY) private readonly repository: ITruckloadDeliveryRepository,
		private readonly eventPublisher: EventPublisher
	) {}

	async execute({ dispatchOrder, po, removedBy }: RemovePurchaseOrderCommand): Promise<void> {
		const model = this.eventPublisher.mergeObjectContext(await this.repository.getByDispatchOrder(dispatchOrder))
		const isEmptied = model.removePurchaseOrder(po, removedBy)

		if (isEmptied) await this.repository.deleteByDispatchOrder(dispatchOrder)
		else await this.repository.save(model)

		model.commit()
	}
}
