import { Api, HttpMethod } from '@/common/decorators/api.decorator'
import { AuthGuard } from '@/common/decorators/auth.decorator'
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
	Sse
} from '@nestjs/common'
import { catchError, from, interval, map, of, switchMap } from 'rxjs'
import {
	ExchangeEpcDTO,
	exchangeEpcValidator,
	searchCustomerValidator,
	SearchCustOrderParamsDTO,
	UpdateStockDTO,
	updateStockValidator
} from './dto/rfid.dto'
import { FPInventoryService } from './rfid.service'

/**
 * @description Controller for Finished Production Inventory (FPI)
 */
@Controller('rfid')
export class FPInventoryController {
	constructor(private readonly fpiService: FPInventoryService) {}

	@Sse('sse')
	@AuthGuard()
	async fetchLatestData(
		@Headers('X-User-Company') factoryCode: string,
		@Headers('X-Polling-Duration') pollingDuration: number
	) {
		const FALLBACK_POLLING_DURATION: number = 1000
		const duration = pollingDuration ?? FALLBACK_POLLING_DURATION
		if (!factoryCode) {
			throw new BadRequestException('Factory code is required')
		}

		/**
		 * @deprecated
		 * Temporary solution to sync data with third party API, it need to update upsert logic
		 */
		// await this.fpiService.syncDataWithThirdPartyApi()

		return interval(duration).pipe(
			switchMap(() =>
				from(this.fpiService.fetchItems({ page: 1 })).pipe(
					catchError((error) => {
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
		return this.fpiService.getManufacturingOrderDetail()
	}

	@Api({
		endpoint: 'search-exchangable-order',
		method: HttpMethod.GET
	})
	@AuthGuard()
	async searchCustomerOrder(
		@Headers('X-User-Company') factory_code: string,
		@Query(new ZodValidationPipe(searchCustomerValidator))
		queries: SearchCustOrderParamsDTO
	) {
		return await this.fpiService.searchCustomerOrder({
			'factory_code.eq': factory_code,
			...queries
		} satisfies SearchCustOrderParamsDTO)
	}

	@Api({
		endpoint: 'fetch-epc',
		method: HttpMethod.GET
	})
	@AuthGuard()
	async fetchNextItems(
		@Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
		@Query('mo_no.eq', new DefaultValuePipe('')) selectedOrder: string
	) {
		return await this.fpiService.findWhereNotInStock({ page, 'mo_no.eq': selectedOrder })
	}

	@Api({
		endpoint: 'update-stock',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: 'common.updated'
	})
	@AuthGuard()
	async updateStock(@Body(new ZodValidationPipe(updateStockValidator)) payload: UpdateStockDTO) {
		return await this.fpiService.updateStock(payload)
	}

	@Api({
		endpoint: 'exchange-epc',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: 'common.updated'
	})
	@AuthGuard()
	async exchangeEpc(@Body(new ZodValidationPipe(exchangeEpcValidator)) payload: ExchangeEpcDTO) {
		return await this.fpiService.exchangeEpc(payload)
	}

	@Api({
		endpoint: 'delete-unexpected-order/:order',
		method: HttpMethod.DELETE,
		statusCode: HttpStatus.NO_CONTENT,
		message: 'common.deleted'
	})
	@AuthGuard()
	async deleteUnexpectedOrder(@Param('order') orderCode: string) {
		return await this.fpiService.deleteUnexpectedOrder(orderCode)
	}
}
