import { HttpMethod, RequireAuthorized, RouteHandler } from '@common/decorators'
import { UserRole } from '@modules/user/domain/constants'
import { Controller, DefaultValuePipe, Inject, Param, ParseBoolPipe, Query } from '@nestjs/common'
import { ORDER_REPOSITORY } from './order.constant'
import { IOrderRepository } from './order.repository.interface'

@Controller('order')
export class OrderController {
	constructor(@Inject(ORDER_REPOSITORY) private readonly orderRepository: IOrderRepository) {}

	@RouteHandler({
		endpoint: '/manufacturing-order/search',
		method: HttpMethod.GET
	})
	@RequireAuthorized(
		UserRole.MANAGER,
		UserRole.FG_WAREHOUSE_STAFF,
		UserRole.DG_WAREHOUSE_STAFF,
		UserRole.INDUSTRIAL_ENGINEERING_STAFF
	)
	async searchManufacturingOrder(@Query('q', new DefaultValuePipe('')) searchTerm: string) {
		return await this.orderRepository.searchManufacturingOrder(searchTerm)
	}

	@RouteHandler({
		endpoint: '/purchase-order/search',
		method: HttpMethod.GET
	})
	@RequireAuthorized(
		UserRole.MANAGER,
		UserRole.FG_WAREHOUSE_STAFF,
		UserRole.DG_WAREHOUSE_STAFF,
		UserRole.IE_STAFF,
		UserRole.INDUSTRIAL_ENGINEERING_STAFF
	)
	async searchPurchaseOrder(
		@Query('q') searchTerm: string,
		@Query('filter_all_brands', new DefaultValuePipe(false), ParseBoolPipe) shouldFilterAllBrands?: boolean
	) {
		return await this.orderRepository.searchPurchaseOrder(searchTerm, shouldFilterAllBrands)
	}

	@RouteHandler({
		endpoint: '/purchase-order/:purchaseOrder',
		method: HttpMethod.GET
	})
	@RequireAuthorized(
		UserRole.MANAGER,
		UserRole.FG_WAREHOUSE_STAFF,
		UserRole.DG_WAREHOUSE_STAFF,
		UserRole.IE_STAFF,
		UserRole.INDUSTRIAL_ENGINEERING_STAFF
	)
	async getPurchaseOrderSizeRun(@Param('purchaseOrder') po: string) {
		return await this.orderRepository.getOnePurchaseOrder(po)
	}

	@RouteHandler({
		endpoint: '/manufacturing-order/:mo',
		method: HttpMethod.GET
	})
	@RequireAuthorized(
		UserRole.MANAGER,
		UserRole.FG_WAREHOUSE_STAFF,
		UserRole.DG_WAREHOUSE_STAFF,
		UserRole.INDUSTRIAL_ENGINEERING_STAFF
	)
	async getOrderDetail(@Param('mo') mo: string) {
		return await this.orderRepository.getOneRawManufacturingOrder(mo)

		// const [orders, sizes] = await Promise.all([
		// 	this.orderService.getCustOrderByCommandNumber(commandNumber),
		// 	this.orderService.getSizeRunByCommandNumber(commandNumber)
		// ])
		// if (orders.length === 0) {
		// 	return { orders: [], sizes: [] }
		// }
		// const groupedOrders = groupBy(orders, 'mo_no')
		// return {
		// 	orders: groupedOrders[commandNumber],
		// 	sizes: sizes
		// }
	}
}
