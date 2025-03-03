import { Api, HttpMethod } from '@/common/decorators'
import { Controller, DefaultValuePipe, Headers, NotFoundException, Param, Query } from '@nestjs/common'
import { groupBy } from 'lodash'
import { OrderService } from './order.service'

@Controller('order')
export class OrderController {
	constructor(private readonly orderService: OrderService) {}

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

		if (orders.length === 0) throw new NotFoundException('Command number could not be found')

		const groupedOrders = groupBy(orders, 'mo_no')
		const orderInformation = groupedOrders[commandNumber]

		return {
			mat_code: orderInformation[0].mat_code,
			shoes_style_code_factory: orderInformation[0].shoes_style_code_factory,
			mo_noseqs: orderInformation.map((item) => item.mo_noseq),
			sizes: sizeRun
		}
	}
}
