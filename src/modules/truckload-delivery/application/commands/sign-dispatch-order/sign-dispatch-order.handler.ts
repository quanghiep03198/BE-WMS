import { Inject } from '@nestjs/common'
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs'
import { ISignatureStorage, SIGNATURE_STORAGE } from '../../ports/signature-storage.port'
import {
	ITruckloadDeliveryRepository,
	TRUCKLOAD_DELIVERY_REPOSITORY
} from '../../ports/truckload-delivery.repository.port'
import { SignDispatchOrderCommand } from './sign-dispatch-order.command'

@CommandHandler(SignDispatchOrderCommand)
export class SignDispatchOrderHandler implements ICommandHandler<SignDispatchOrderCommand, void> {
	constructor(
		@Inject(TRUCKLOAD_DELIVERY_REPOSITORY) private readonly repository: ITruckloadDeliveryRepository,
		private readonly eventPublisher: EventPublisher,
		@Inject(SIGNATURE_STORAGE) private readonly signatureStorage: ISignatureStorage
	) {}

	async execute(command: SignDispatchOrderCommand): Promise<void> {
		const model = this.eventPublisher.mergeObjectContext(
			await this.repository.getByDispatchOrder(command.dispatchOrder)
		)
		const previousSignatureId = model.toProps()[command.signatureField]
		const signatureId = await this.signatureStorage.upload(
			command.signature,
			`${command.dispatchOrder}.${command.signatureField}`
		)

		try {
			model.sign(command.signatureField, signatureId, command.approvalStatus, command.updatedBy)
			await this.repository.save(model)
		} catch (error) {
			await this.signatureStorage.remove(signatureId)
			throw error
		}
		await this.signatureStorage.remove(previousSignatureId)
		model.commit()
	}
}
