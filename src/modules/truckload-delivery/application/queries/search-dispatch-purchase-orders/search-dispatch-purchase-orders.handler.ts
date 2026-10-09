import { ORDER_REPOSITORY } from '@modules/order/order.constant'
import { IOrderRepository } from '@modules/order/order.repository.interface'
import { Inject } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { SearchedPurchaseOrder } from '../../interfaces'
import {
	ITruckloadDeliveryRepository,
	TRUCKLOAD_DELIVERY_REPOSITORY
} from '../../ports/truckload-delivery.repository.port'
import { SearchDispatchPurchaseOrdersQuery } from './search-dispatch-purchase-orders.query'

@QueryHandler(SearchDispatchPurchaseOrdersQuery)
export class SearchDispatchPurchaseOrdersHandler implements IQueryHandler<
	SearchDispatchPurchaseOrdersQuery,
	SearchedPurchaseOrder[]
> {
	constructor(
		@Inject(TRUCKLOAD_DELIVERY_REPOSITORY) private readonly truckloadDeliveryRepository: ITruckloadDeliveryRepository,
		@Inject(ORDER_REPOSITORY) private readonly orderRepository: IOrderRepository
	) {}

	async execute({ searchTerm }: SearchDispatchPurchaseOrdersQuery): Promise<SearchedPurchaseOrder[]> {
		const purchaseOrders = await this.orderRepository.searchPurchaseOrder(searchTerm, false)
		if (purchaseOrders.length === 0) return []

		const dispatchedQty = await this.truckloadDeliveryRepository.sumDispatchedQtyByPo(
			purchaseOrders.map((item) => item.po)
		)

		return purchaseOrders.map((item) => {
			const dispatched = dispatchedQty.get(item.po) ?? 0
			return { ...item, dispatched_outbound_qty: dispatched, max_outbound_qty: item.order_qty - dispatched }
		})
	}
}
