import { Inject } from '@nestjs/common'
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs'
import {
	ITruckloadDeliveryRepository,
	TRUCKLOAD_DELIVERY_REPOSITORY
} from '../../ports/truckload-delivery.repository.port'
import { UpdateDispatchOrderCommand } from './update-dispatch-order.command'

@CommandHandler(UpdateDispatchOrderCommand)
export class UpdateDispatchOrderHandler implements ICommandHandler<UpdateDispatchOrderCommand, void> {
	constructor(
		@Inject(TRUCKLOAD_DELIVERY_REPOSITORY) private readonly repository: ITruckloadDeliveryRepository,
		private readonly eventPublisher: EventPublisher
	) {}

	async execute({ dispatchOrder, update, updatedBy }: UpdateDispatchOrderCommand): Promise<void> {
		const model = this.eventPublisher.mergeObjectContext(await this.repository.getByDispatchOrder(dispatchOrder))
		model.updateInfo(update, updatedBy)
		await this.repository.save(model)
		model.commit()
	}
}
