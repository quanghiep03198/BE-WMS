import { Api, HttpMethod } from '@/common/decorators/api.decorator'
import { AuthGuard } from '@/common/decorators/auth.decorator'
import { User } from '@/common/decorators/user.decorator'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'
import { InjectQueue } from '@nestjs/bullmq'
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
import { Queue } from 'bullmq'
import fs from 'fs'
import { catchError, from, map, of, ReplaySubject } from 'rxjs'
import { POST_DATA_QUEUE } from './constants'
import {
	deleteEpcBySizeValidator,
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
import { DeleteEpcBySizeParams } from './types'

/**
 * @description Controller for Finished Production Inventory (FPI)
 */

@Controller('rfid')
export class RFIDController {
	constructor(
		@InjectQueue(POST_DATA_QUEUE) private readonly postDataQueue: Queue,
		private readonly rfidService: RFIDService
	) {}

	@Sse('sse')
	@AuthGuard()
	async fetchLatestData(@Headers('X-Tenant-Id') tenantId: string) {
		try {
			const subject = new ReplaySubject<any>(1)

			const postMessage = () => {
				from(this.rfidService.fetchLatestData({ _page: 1, _limit: 50 }))
					.pipe(
						catchError((error) => of({ error: error.message })),
						map((data) => ({ data }))
					)
					.subscribe((data) => {
						subject.next(data)
					})
			}

			postMessage()

			const dataFilePath = RFIDDataService.getEpcDataFile(tenantId)
			fs.watch(dataFilePath, (_, filename) => {
				if (filename) postMessage()
			})

			return subject.asObservable()
		} catch (error) {
			Logger.error(error)
		}
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

	@Api({
		endpoint: 'manufacturing-order-detail',
		method: HttpMethod.GET
	})
	@AuthGuard()
	async getOrderDetails() {
		return this.rfidService.getOrderDetails()
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
		endpoint: 'update-stock/:orderCode',
		method: HttpMethod.PUT,
		statusCode: HttpStatus.CREATED,
		message: 'common.updated'
	})
	@AuthGuard()
	async updateFPStock(
		@Param('orderCode') orderCode: string,
		@User('username') username: string,
		@Headers('X-User-Company') factoryCode: string,
		@Body(new ZodValidationPipe(updateStockValidator)) payload: UpdateStockDTO
	) {
		return await this.rfidService.updateFPStock(orderCode, {
			...payload,
			user_code_created: username,
			factory_code: factoryCode
		})
	}

	@Api({
		endpoint: 'post-data/:tenantId',
		method: HttpMethod.POST,
		statusCode: HttpStatus.CREATED,
		message: 'common.created'
	})
	async postData(
		@Param('tenantId') tenantId: string,
		@Body(new ZodValidationPipe(readerPostDataValidator)) payload: PostReaderDataDTO
	) {
		return await this.postDataQueue.add(tenantId, payload, {
			deduplication: { id: tenantId, ttl: 3000 }
		})
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
	async deleteEpcBySize(
		@Headers('X-Tenant-Id') tenantId: string,
		@Query(new ZodValidationPipe(deleteEpcBySizeValidator)) filters: DeleteEpcBySizeParams
	) {
		return await this.rfidService.deleteEpcBySize(tenantId, filters)
	}
}
