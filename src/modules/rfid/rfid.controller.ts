import { AuthGuard } from '@/common/decorators/auth.decorator'
import { Api, HttpMethod } from '@/common/decorators/base-api.decorator'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'
import {
	BadRequestException,
	Body,
	Controller,
	DefaultValuePipe,
	Headers,
	HttpStatus,
	Param,
	ParseIntPipe,
	Query,
	Sse,
	UsePipes
} from '@nestjs/common'
import { catchError, from, interval, map, of, switchMap } from 'rxjs'
import { ExchangeEpcDTO, exchangeEpcValidator, UpdateStockDTO, updateStockValidator } from './dto/rfid.dto'
import { RFIDService } from './rfid.service'

@Controller('rfid')
// @UseInterceptors(TenancyInterceptor)
export class RFIDController {
	constructor(private rfidService: RFIDService) {}

	@Sse('fetch-epc')
	@AuthGuard()
	fetchLatestData(@Headers('X-Polling-Duration') pollingDuration: number) {
		const FALLBACK_POLLING_DURATION = 500
		const duration = pollingDuration ?? FALLBACK_POLLING_DURATION

		return interval(duration).pipe(
			switchMap(() =>
				from(this.rfidService.fetchItems({ page: 1 })).pipe(
					catchError((error) => {
						console.error(error.message)
						return of({ error: error.message })
					})
				)
			),
			map((data) => ({ data }))
		)
	}

	@Api({
		endpoint: 'manufacturing-order-detail',
		method: HttpMethod.GET
	})
	@AuthGuard()
	async getManufacturingOrderDetail() {
		return this.rfidService.getManufacturingOrderDetail()
	}

	@Api({
		endpoint: 'search-exchangable-order',
		method: HttpMethod.GET
	})
	@AuthGuard()
	async searchCustomerOrder(
		@Query('target') orderTarget: string,
		@Query('search', new DefaultValuePipe('')) searchTerm: string
	) {
		if (!orderTarget) throw new BadRequestException('Order target is required')
		return await this.rfidService.searchCustomerOrder(orderTarget, searchTerm)
	}

	@Api({
		endpoint: 'fetch-next-epc',
		method: HttpMethod.GET
	})
	@AuthGuard()
	async fetchNextItems(
		@Query('page', new DefaultValuePipe(2), ParseIntPipe) page: number,
		@Query('filter', new DefaultValuePipe('')) filter: string
	) {
		return await this.rfidService.findWhereNotInStock({ page, filter })
	}

	@Api({
		endpoint: 'update-stock',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: { i18nKey: 'common.updated' }
	})
	@AuthGuard()
	@UsePipes(new ZodValidationPipe(updateStockValidator))
	async updateStock(@Body() payload: UpdateStockDTO) {
		return await this.rfidService.updateStock(payload)
	}

	@Api({
		endpoint: 'exchange-epc',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: { i18nKey: 'common.updated' }
	})
	@AuthGuard()
	@UsePipes(new ZodValidationPipe(exchangeEpcValidator))
	async exchangeEpc(@Body() payload: ExchangeEpcDTO) {
		return await this.rfidService.exchangeEpc(payload)
	}

	@Api({
		endpoint: 'delete-unexpected-order/:order',
		method: HttpMethod.DELETE,
		statusCode: HttpStatus.NO_CONTENT,
		message: { i18nKey: 'common.deleted' }
	})
	@AuthGuard()
	async deleteUnexpectedOrder(@Param('order') orderCode: string) {
		return await this.rfidService.deleteUnexpectedOrder(orderCode)
	}
}
