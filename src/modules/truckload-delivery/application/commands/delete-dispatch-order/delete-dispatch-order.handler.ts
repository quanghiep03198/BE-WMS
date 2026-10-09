import { Inject } from '@nestjs/common'
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs'
import {
	ITruckloadDeliveryRepository,
	TRUCKLOAD_DELIVERY_REPOSITORY
} from '../../ports/truckload-delivery.repository.port'
import { DeleteDispatchOrderCommand } from './delete-dispatch-order.command'

@CommandHandler(DeleteDispatchOrderCommand)
export class DeleteDispatchOrderHandler implements ICommandHandler<DeleteDispatchOrderCommand, void> {
	constructor(
		@Inject(TRUCKLOAD_DELIVERY_REPOSITORY) private readonly repository: ITruckloadDeliveryRepository,
		private readonly eventPublisher: EventPublisher
	) {}

	async execute({ dispatchOrder }: DeleteDispatchOrderCommand): Promise<void> {
		const model = this.eventPublisher.mergeObjectContext(await this.repository.getByDispatchOrder(dispatchOrder))
		model.delete()
		await this.repository.deleteByDispatchOrder(dispatchOrder)
		model.commit()
	}
}
