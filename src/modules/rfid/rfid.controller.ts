import { Api, HttpMethod } from '@/common/decorators/api.decorator'
import { AuthGuard } from '@/common/decorators/auth.decorator'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'
import {
	Body,
	Controller,
	DefaultValuePipe,
	Headers,
	HttpStatus,
	Logger,
	Param,
	ParseIntPipe,
	Query,
	Sse
} from '@nestjs/common'
import fs from 'fs'
import { catchError, from, map, of, Subject } from 'rxjs'
import {
	ExchangeEpcDTO,
	exchangeEpcValidator,
	PostReaderDataDTO,
	readerPostDataValidator,
	searchCustomerValidator,
	SearchCustOrderParamsDTO,
	UpdateStockDTO,
	updateStockValidator
} from './dto/rfid.dto'
import { RFIDDataService } from './rfid.data.service'
import { RFIDService } from './rfid.service'

/**
 * @description Controller for Finished Production Inventory (FPI)
 */
@Controller('rfid')
export class RFIDController {
	constructor(private readonly rfidService: RFIDService) {}

	@Sse('sse')
	@AuthGuard()
	async fetchLatestData(@Headers('X-Tenant-Id') tenantId: string) {
		try {
			const subject = new Subject<any>()
			const dataFilePath = RFIDDataService.getInvDataFile(tenantId)

			const postMessage = () => {
				from(this.rfidService.getIncomingEpcs({ _page: 1, _limit: 50 }))
					.pipe(
						catchError((error) => of({ error: error.message })),
						map((data) => ({ data }))
					)
					.subscribe((data) => subject.next(data))
			}

			postMessage()

			fs.watch(dataFilePath, (_, filename) => {
				if (filename) postMessage()
			})

			return subject.asObservable()
		} catch (error) {
			Logger.error(error)
		}
	}

	@Api({
		endpoint: 'third-party-api-sync',
		method: HttpMethod.PUT,
		statusCode: HttpStatus.CREATED
	})
	async triggerSync() {
		// ! This service will be replaced by Redis BullMQ to handle with queue
		await this.rfidService.dispatchApiCall()
	}

	@Api({
		endpoint: 'manufacturing-order-detail',
		method: HttpMethod.GET
	})
	@AuthGuard()
	async getManufacturingOrderDetail() {
		return this.rfidService.getOrderDetailsByEpcs()
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
		return await this.rfidService.searchCustomerOrder({
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
		return await this.rfidService.getIncomingEpcs({ _page: page, _limit: 50, 'mo_no.eq': selectedOrder })
	}

	/**
	 * @deprecated
	 */
	@Api({
		endpoint: 'update-stock/:orderCode',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: 'common.updated'
	})
	@AuthGuard()
	async updateStock(
		@Param('orderCode') orderCode: string,
		@Body(new ZodValidationPipe(updateStockValidator)) payload: UpdateStockDTO
	) {
		return await this.rfidService.updateStock(orderCode, payload)
	}

	@Api({
		endpoint: 'post-data/:tenant_id',
		method: HttpMethod.POST,
		statusCode: HttpStatus.CREATED,
		message: 'common.created'
	})
	async postData(
		@Param('tenant_id') tenantId: string,
		@Body(new ZodValidationPipe(readerPostDataValidator)) payload: PostReaderDataDTO
	) {
		return await this.rfidService.postDataToQueue(tenantId, payload)
	}

	@Api({
		endpoint: 'exchange-epc',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: 'common.updated'
	})
	@AuthGuard()
	async exchangeEpc(@Body(new ZodValidationPipe(exchangeEpcValidator)) payload: ExchangeEpcDTO) {
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

	@Api({
		endpoint: 'delete-unexpected-epc',
		method: HttpMethod.DELETE,
		statusCode: HttpStatus.NO_CONTENT,
		message: 'common.deleted'
	})
	@AuthGuard()
	async deleteEpcBySize(@Query(new ZodValidationPipe(searchCustomerValidator)) queries: any) {
		return await this.rfidService.deleteEpcBySize(queries)
	}
}
