import { CommonRequestHeader } from '@common/constants'
import { HttpMethod, RequireAuthorized, RouteHandler } from '@common/decorators'
import { Controller, DefaultValuePipe, Headers, Param, ParseBoolPipe, Query } from '@nestjs/common'
import { UserRole } from '../user/constants'
import { OrderService } from './order.service'

@Controller('order')
export class OrderController {
	constructor(private readonly orderService: OrderService) {}

	@RouteHandler({
		endpoint: '/command-number/search',
		method: HttpMethod.GET
	})
	@RequireAuthorized(
		UserRole.MANAGER,
		UserRole.FG_WAREHOUSE_STAFF,
		UserRole.DG_WAREHOUSE_STAFF,
		UserRole.INDUSTRIAL_ENGINEERING_STAFF
	)
	async searchCommandNumber(
		@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@Query('q', new DefaultValuePipe('')) searchTerm: string
	) {
		return await this.orderService.searchManufacturingOrder(factoryCode, searchTerm)
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
		return await this.orderService.searchPurchaseOrder(searchTerm, shouldFilterAllBrands)
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
	async getPurchaseOrderInfo(@Param('purchaseOrder') purchaseOrder: string) {
		return await this.orderService.getPurchaseOrderInfo(purchaseOrder)
	}

	@RouteHandler({
		endpoint: '/purchase-order/size-run/:purchaseOrder',
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
		return await this.orderService.getPurchaseOrderSizeRun(po)
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
		return await this.orderService.getManufacturingOrderSizeRun(mo)

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
