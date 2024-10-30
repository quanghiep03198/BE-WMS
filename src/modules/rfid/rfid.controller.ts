import { Api, HttpMethod } from '@/common/decorators/api.decorator'
import { AuthGuard } from '@/common/decorators/auth.decorator'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import {
	BadRequestException,
	Body,
	Controller,
	DefaultValuePipe,
	Headers,
	HttpStatus,
	Inject,
	Param,
	ParseIntPipe,
	Query,
	Sse,
	UsePipes
} from '@nestjs/common'
import { Cache } from 'cache-manager'
import { catchError, from, interval, map, of, switchMap } from 'rxjs'
import { ThirdPartyApiService } from '../third-party-api/third-party.service'
import { ExchangeEpcDTO, exchangeEpcValidator, UpdateStockDTO, updateStockValidator } from './dto/rfid.dto'
import { RFIDService } from './rfid.service'

@Controller('rfid')
export class RFIDController {
	constructor(
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
		private readonly thirdPartyApiService: ThirdPartyApiService,
		private rfidService: RFIDService
	) {}

	@Sse('fetch-epc/sse')
	@AuthGuard()
	async fetchLatestData(
		@Headers('X-User-Company') factoryCode: string,
		@Headers('X-Polling-Duration') pollingDuration: number
	) {
		const FALLBACK_POLLING_DURATION = 500
		const duration = pollingDuration ?? FALLBACK_POLLING_DURATION
		if (!factoryCode) {
			throw new BadRequestException('Factory code is required')
		}
		const syncProcessFlag = await this.cacheManager.get(`sync_process:${factoryCode}`)
		if (!syncProcessFlag) {
			await this.cacheManager.set(`sync_process:${factoryCode}`, true, 60 * 1000 * 60)
			const isAuthenticated = await this.thirdPartyApiService.authenticate(factoryCode)
			if (isAuthenticated) this.rfidService.fetchThirdPartyApi()
		}

		return interval(duration).pipe(
			switchMap(() =>
				from(this.rfidService.fetchItems({ page: 1 })).pipe(
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
		return this.rfidService.getManufacturingOrderDetail()
	}

	@Api({
		endpoint: 'search-exchangable-order',
		method: HttpMethod.GET
	})
	@AuthGuard()
	async searchCustomerOrder(
		@Headers('X-User-Company') factoryCode: string,
		@Query('search', new DefaultValuePipe('')) searchTerm: string
	) {
		return await this.rfidService.searchCustomerOrder(factoryCode, searchTerm)
	}

	@Api({
		endpoint: 'fetch-epc',
		method: HttpMethod.GET
	})
	@AuthGuard()
	async fetchNextItems(
		@Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
		@Query('filter', new DefaultValuePipe('')) filter: string
	) {
		return await this.rfidService.findWhereNotInStock({ page, filter })
	}

	@Api({
		endpoint: 'update-stock',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: 'common.updated'
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
		message: 'common.updated'
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
		message: 'common.deleted'
	})
	@AuthGuard()
	async deleteUnexpectedOrder(@Param('order') orderCode: string) {
		return await this.rfidService.deleteUnexpectedOrder(orderCode)
	}
}
