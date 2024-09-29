import { UseAuth } from '@/common/decorators/auth.decorator'
import { UseBaseAPI } from '@/common/decorators/base-api.decorator'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'
import {
	Body,
	Controller,
	DefaultValuePipe,
	Delete,
	Get,
	Headers,
	HttpStatus,
	Param,
	ParseIntPipe,
	Patch,
	Query,
	Sse,
	UsePipes
} from '@nestjs/common'
import { catchError, from, interval, map, of, switchMap } from 'rxjs'
import { ExchangeEpcDTO, exchangeEpcValidator, UpdateStockDTO, updateStockValidator } from './dto/rfid.dto'
import { RFIDService } from './rfid.service'

@Controller('rfid')
export class RFIDController {
	constructor(private rfidService: RFIDService) {}

	@Sse('fetch-epc')
	@UseAuth()
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

	@Get('fetch-next-epc')
	@UseAuth()
	@UseBaseAPI(HttpStatus.OK, { i18nKey: 'common.ok' })
	async fetchNextItems(
		@Query('page', new DefaultValuePipe(2), ParseIntPipe) page: number,
		@Query('filter', new DefaultValuePipe('')) filter: string
	) {
		return await this.rfidService.findWhereNotInStock({ page, filter })
	}

	@Patch('update-stock')
	@UseAuth()
	@UsePipes(new ZodValidationPipe(updateStockValidator))
	@UseBaseAPI(HttpStatus.CREATED, { i18nKey: 'common.updated' })
	async updateStock(@Body() payload: UpdateStockDTO) {
		return await this.rfidService.updateStock(payload)
	}

	@Patch('exchange-epc')
	@UseAuth()
	@UsePipes(new ZodValidationPipe(exchangeEpcValidator))
	@UseBaseAPI(HttpStatus.CREATED, { i18nKey: 'common.updated' })
	async exchangeEpc(@Body() payload: ExchangeEpcDTO) {
		return await this.rfidService.exchangeEpc(payload)
	}

	@Delete('delete-unexpected-order/:order')
	@UseAuth()
	@UseBaseAPI(HttpStatus.NO_CONTENT, { i18nKey: 'common.updated' })
	async deleteUnexpectedOrder(@Param('order') orderCode: string) {
		return await this.rfidService.deleteUnexpectedOrder(orderCode)
	}
}
