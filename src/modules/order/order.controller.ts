import { CommonRequestHeader } from '@/common/constants'
import { Api, AuthGuard, HttpMethod } from '@/common/decorators'
import { Controller, DefaultValuePipe, Headers, NotFoundException, Param, Query } from '@nestjs/common'
import { groupBy } from 'lodash'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { OrderService } from './order.service'

@Controller('order')
export class OrderController {
	constructor(
		private readonly orderService: OrderService,
		private readonly i18nService: I18nService
	) {}

	@Api({
		endpoint: '/command-number/search',
		method: HttpMethod.GET
	})
	@AuthGuard()
	async searchCommandNumber(
		@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@Query('q', new DefaultValuePipe('')) searchTerm: string
	) {
		return await this.orderService.searchCommandNumber(factoryCode, searchTerm)
	}

	@Api({
		endpoint: '/purchase-order/search',
		method: HttpMethod.GET
	})
	@AuthGuard()
	async searchPurchaseOrder(@Query('q') searchTerm: string) {
		return await this.orderService.searchPurchaseOrder(searchTerm)
	}

	@Api({
		endpoint: '/purchase-order/size-run/:purchaseOrder',
		method: HttpMethod.GET
	})
	@AuthGuard()
	async getPurchaseOrderSizeRun(@Param('purchaseOrder') po: string) {
		return await this.orderService.getPurchaseOrderSizeRun(po)
	}

	@Api({
		endpoint: '/command-number/:commandNumber',
		method: HttpMethod.GET
	})
	@AuthGuard()
	async getOrderDetail(@Param('commandNumber') commandNumber: string) {
		const [orders, sizes] = await Promise.all([
			this.orderService.getCustOrderByCommandNumber(commandNumber),
			this.orderService.getSizeRunByCommandNumber(commandNumber)
		])
		if (orders.length === 0) {
			throw new NotFoundException(this.i18nService.t('common.not_found', { lang: I18nContext.current()?.lang }))
		}
		const groupedOrders = groupBy(orders, 'mo_no')
		return {
			orders: groupedOrders[commandNumber],
			sizes: sizes
		}
	}
}
