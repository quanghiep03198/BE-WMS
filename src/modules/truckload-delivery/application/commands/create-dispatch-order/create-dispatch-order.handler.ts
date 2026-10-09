import { FactoryAgencyCode } from '@common/constants/factory'
import { ORDER_REPOSITORY } from '@modules/order/order.constant'
import { IOrderRepository } from '@modules/order/order.repository.interface'
import { Inject } from '@nestjs/common'
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs'
import { DispatchOrderAlreadyExistsException } from '../../../domain/exceptions'
import { DispatchOrderModel } from '../../../domain/models/dispatch-order.model'
import { DispatchOrderCode } from '../../../domain/value-objects/dispatch-order-code.vo'
import {
	ITruckloadDeliveryRepository,
	TRUCKLOAD_DELIVERY_REPOSITORY
} from '../../ports/truckload-delivery.repository.port'
import { CreateDispatchOrderCommand } from './create-dispatch-order.command'

const MAX_CODE_ALLOCATION_ATTEMPTS = 5

@CommandHandler(CreateDispatchOrderCommand)
export class CreateDispatchOrderHandler implements ICommandHandler<CreateDispatchOrderCommand, string> {
	constructor(
		@Inject(TRUCKLOAD_DELIVERY_REPOSITORY) private readonly repository: ITruckloadDeliveryRepository,
		@Inject(ORDER_REPOSITORY) private readonly orderRepository: IOrderRepository,
		private readonly eventPublisher: EventPublisher
	) {}

	async execute(command: CreateDispatchOrderCommand): Promise<string> {
		const factoryAgencyCode = FactoryAgencyCode[command.factoryCode]
		const now = new Date()
		const purchaseOrderDetails = await this.orderRepository.getPurchaseOrderSnapshots(
			command.purchaseOrders.map(({ po }) => po)
		)
		const purchaseOrders = command.purchaseOrders.map((line) => {
			const details = purchaseOrderDetails.find((item) => item.po === line.po)
			return {
				...line,
				brand_name: details?.brand_name ?? null,
				factory_shoes_style: details?.factory_shoes_style ?? null,
				color_sn: details?.color_sn ?? null
			}
		})

		let lastError: unknown
		for (let attempt = 0; attempt < MAX_CODE_ALLOCATION_ATTEMPTS; attempt++) {
			const takenCodes = await this.repository.findDispatchOrderCodesByPrefix(
				DispatchOrderCode.prefixOf(factoryAgencyCode, now)
			)
			const code = DispatchOrderCode.next(factoryAgencyCode, now, takenCodes)

			const dispatchOrder = DispatchOrderModel.create({
				dispatchOrder: code.value,
				factoryCode: command.factoryCode,
				licensePlate: command.licensePlate,
				containerNumber: command.containerNumber,
				sealNumber: command.sealNumber,
				purchaseOrders,
				createdBy: command.createdBy
			})

			try {
				await this.repository.insert(dispatchOrder)
			} catch (error) {
				// * Another request took the same sequence number, allocate again
				if (error instanceof DispatchOrderAlreadyExistsException) {
					lastError = error
					continue
				}
				throw error
			}

			this.eventPublisher.mergeObjectContext(dispatchOrder).commit()
			return code.value
		}

		throw lastError
	}
}
