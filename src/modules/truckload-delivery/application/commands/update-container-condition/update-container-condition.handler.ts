import { Inject } from '@nestjs/common'
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs'
import {
	ITruckloadDeliveryRepository,
	TRUCKLOAD_DELIVERY_REPOSITORY
} from '../../ports/truckload-delivery.repository.port'
import { UpdateContainerConditionCommand } from './update-container-condition.command'

@CommandHandler(UpdateContainerConditionCommand)
export class UpdateContainerConditionHandler implements ICommandHandler<UpdateContainerConditionCommand, void> {
	constructor(
		@Inject(TRUCKLOAD_DELIVERY_REPOSITORY) private readonly repository: ITruckloadDeliveryRepository,
		private readonly eventPublisher: EventPublisher
	) {}

	async execute({ dispatchOrder, condition, updatedBy }: UpdateContainerConditionCommand): Promise<void> {
		const model = this.eventPublisher.mergeObjectContext(await this.repository.getByDispatchOrder(dispatchOrder))
		model.updateContainerCondition(condition, updatedBy)
		await this.repository.save(model)
		model.commit()
	}
}
