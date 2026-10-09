import { ORDER_REPOSITORY } from '@modules/order/order.constant'
import { IOrderRepository } from '@modules/order/order.repository.interface'
import { Inject } from '@nestjs/common'
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs'
import {
	ITruckloadDeliveryRepository,
	TRUCKLOAD_DELIVERY_REPOSITORY
} from '../../ports/truckload-delivery.repository.port'
import { UpsertPurchaseOrdersCommand } from './upsert-purchase-orders.command'

@CommandHandler(UpsertPurchaseOrdersCommand)
export class UpsertPurchaseOrdersHandler implements ICommandHandler<UpsertPurchaseOrdersCommand, void> {
	constructor(
		@Inject(TRUCKLOAD_DELIVERY_REPOSITORY) private readonly repository: ITruckloadDeliveryRepository,
		@Inject(ORDER_REPOSITORY) private readonly orderRepository: IOrderRepository,
		private readonly eventPublisher: EventPublisher
	) {}

	async execute({ dispatchOrder, purchaseOrders, updatedBy }: UpsertPurchaseOrdersCommand): Promise<void> {
		const model = this.eventPublisher.mergeObjectContext(await this.repository.getByDispatchOrder(dispatchOrder))
		const purchaseOrderDetails = await this.orderRepository.getPurchaseOrderSnapshots(
			purchaseOrders.map(({ po }) => po)
		)
		const lines = purchaseOrders.map((line) => {
			const details = purchaseOrderDetails.find((item) => item.po === line.po)
			return {
				...line,
				order_qty: details?.order_qty ?? 0,
				brand_name: details?.brand_name ?? null,
				factory_shoes_style: details?.factory_shoes_style ?? null,
				color_sn: details?.color_sn ?? null
			}
		})
		model.upsertPurchaseOrders(lines, updatedBy)
		await this.repository.save(model)
		model.commit()
	}
}
