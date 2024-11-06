import { Api, HttpMethod } from '@/common/decorators/api.decorator'
import { AuthGuard } from '@/common/decorators/auth.decorator'
import { Body, Controller, Headers, HttpStatus, Param, Query } from '@nestjs/common'
import { CreateTransferOrderDTO, DeleteTransferOrderDTO } from '../dto/transfer-order.dto'
import { ITransferOrderDatalistParams } from '../interfaces/transfer-order.interface'
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
		@Query('time_range') timeRange: any,

		@Query('brand') customerBrand: string
	) {
		timeRange = JSON.parse(timeRange)
		return await this.transferOrderService.getTransferOrderDatalist({
			time_range: timeRange,
			customer_brand: customerBrand,
			factory_code: factoryCode
		} satisfies ITransferOrderDatalistParams)
	}

	@Api({ endpoint: 'search-customer-brand', method: HttpMethod.GET })
	@AuthGuard()
	async searchCustomerBrand(@Query('search') searchTerm: string) {
		return await this.transferOrderService.searchCustomerBrand(searchTerm)
	}

	@Api({ endpoint: 'detail/:transfer_order_code', method: HttpMethod.GET })
	@AuthGuard()
	async getDetail(@Param('transfer_order_code') transfer_order_code: string) {
		return await this.transferOrderService.getDetail(transfer_order_code)
	}

	@Api({
		method: HttpMethod.DELETE,
		statusCode: HttpStatus.NO_CONTENT,
		message: { i18nKey: 'common.deleted' }
	})
	@AuthGuard()
	async deleteTransferOrder(@Body() payload: DeleteTransferOrderDTO) {
		return await this.transferOrderService.deleteTransferOrder(payload)
	}

	@Api({ method: HttpMethod.POST, statusCode: HttpStatus.CREATED, message: 'common.created' })
	@AuthGuard()
	async createTransferOrder(
		@Body() storeTransferOrderDto: CreateTransferOrderDTO,
		@Headers('X-User-Company') companyCode: string
	) {
		const payload = (storeTransferOrderDto as any).payload as CreateTransferOrderDTO

		return await this.transferOrderService.createTransferOrder(companyCode, payload)
	}

	@Api({ endpoint: 'detail/:transfer_order_code', method: HttpMethod.PATCH })
	@AuthGuard()
	async updateTransferOrder(
		@Param('transfer_order_code') transfer_order_code: string,
		@Body() storeTransferOrderDto: any
	) {
		return await this.transferOrderService.updateTransferOrder(transfer_order_code, storeTransferOrderDto)
	}

	@Api({ endpoint: 'update/:transfer_order_code', method: HttpMethod.PATCH })
	@AuthGuard()
	async updateTransferOrderApprove(
		@Param('transfer_order_code') transfer_order_code: string,
		@Body() storeTransferOrderDto: any
	) {
		return await this.transferOrderService.updateTransferOrderApprove(transfer_order_code, storeTransferOrderDto)
	}

	@Api({ endpoint: 'update-multi', method: HttpMethod.PATCH })
	async updateMulti(@Body() payload: any) {
		return await this.transferOrderService.updateMulti(payload.payload)
	}
}
