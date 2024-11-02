import { Api, HttpMethod } from '@/common/decorators/api.decorator'
import { AuthGuard } from '@/common/decorators/auth.decorator'
import { Controller, DefaultValuePipe, Headers, HttpStatus, Query } from '@nestjs/common'
import { subMonths } from 'date-fns'
import { TransferOrderService } from '../services/transfer-order.service'

@Controller('order/transfer-order')
export class TransferOrderController {
	constructor(private readonly transferOrderService: TransferOrderService) {}

	@Api({ method: HttpMethod.GET })
	@AuthGuard()
	async getTransferOrderByFactory(@Headers('X-User-Company') factoryCode: string) {
		return await this.transferOrderService.getTransferOrderByFactory(factoryCode)
	}

	@Api({ endpoint: 'datalist', method: HttpMethod.GET })
	@AuthGuard()
	async getTransferOrderDatalist(
		@Headers('X-User-Company') factoryCode: string,
		@Query('time_range.from', new DefaultValuePipe(subMonths(new Date(), 1))) startDate: Date,
		@Query('time_range.from', new DefaultValuePipe(new Date())) endDate: Date,
		@Query('customer_brand') customerBrand: string
	) {
		return await this.transferOrderService.getTransferOrderDatalist({
			time_range: { from: startDate, to: endDate },
			customer_brand: customerBrand,
			factory_code: factoryCode
		})
	}

	@Api({ endpoint: 'search-customer-brand', method: HttpMethod.GET })
	@AuthGuard()
	async searchCustomerBrand(@Query('search') searchTerm: string) {
		return await this.transferOrderService.searchCustomerBrand(searchTerm)
	}

	@Api({ method: HttpMethod.POST, statusCode: HttpStatus.CREATED, message: 'common.created' })
	@AuthGuard()
	async createTransferOrder() {}
}
