import { Api, HttpMethod } from '@/common/decorators'
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
		endpoint: '/search',
		method: HttpMethod.GET
	})
	async searchCommandNumber(
		@Headers('X-User-Company') factoryCode: string,
		@Query('q', new DefaultValuePipe('')) searchTerm: string
	) {
		return await this.orderService.searchCommandNumber(factoryCode, searchTerm)
	}

	@Api({
		endpoint: '/detail/:commandNumber',
		method: HttpMethod.GET
	})
	async getOrderDetail(@Param('commandNumber') commandNumber: string) {
		const [orders, sizeRun] = await Promise.all([
			this.orderService.getCustOrderByCommandNumber(commandNumber),
			this.orderService.getSizeRunByCommandNumber(commandNumber)
		])
		if (orders.length === 0) {
			throw new NotFoundException(this.i18nService.t('common.not_found', { lang: I18nContext.current()?.lang }))
		}
		const groupedOrders = groupBy(orders, 'mo_no')
		const orderInformation = groupedOrders[commandNumber]
		return {
			mo_no: commandNumber,
			mat_code: orderInformation[0].mat_code,
			or_no: orderInformation[0].or_no,
			or_cust_po: orderInformation[0].or_cust_po,
			cust_shoes_style: orderInformation[0].cust_shoes_style,
			shoes_style_code_factory: orderInformation[0].shoes_style_code_factory,
			size_code: orderInformation[0].size_code,
			size_sumqty: orderInformation[0].size_qty,
			mo_noseqs: orderInformation.map((item) => item.mo_noseq),
			sizes: sizeRun
		}
	}
}
