import { Api, HttpMethod } from '@/common/decorators/api.decorator'
import { AuthGuard } from '@/common/decorators/auth.decorator'
import { User } from '@/common/decorators/user.decorator'
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
import { InjectModel } from '@nestjs/mongoose'
import { DeleteResult, PaginateModel } from 'mongoose'
import { catchError, from, map, of, ReplaySubject } from 'rxjs'
import {
	deleteEpcValidator,
	ExchangeEpcDTO,
	exchangeEpcValidator,
	PostReaderDataDTO,
	readerPostDataValidator,
	searchCustomerValidator,
	SearchCustOrderParamsDTO,
	updateStockValidator,
	UpsertStockDTO
} from './dto/rfid.dto'
import { RFIDService } from './rfid.service'
import { Epc, EpcDocument } from './schemas/epc.schema'
import { DeleteEpcBySizeParams } from './types'

/**
 * @description Controller for Finished Production Inventory (FPI)
 */

@Controller('rfid')
export class RFIDController {
	constructor(
		@InjectModel(Epc.name) private readonly epcModel: PaginateModel<EpcDocument>,
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

			// * Initial fetch
			postMessage()

			// * Watch for changes in the data file
			this.epcModel.watch().on('change', (change) => {
				if (change.fullDocument?.tenant_id === tenantId) {
					postMessage()
				}
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
		@Query('_page', new DefaultValuePipe(1), ParseIntPipe) page: number,
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
		@Body(new ZodValidationPipe(updateStockValidator)) payload: UpsertStockDTO
	) {
		return await this.rfidService.upsertFPStock(orderCode, {
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
		return await this.rfidService.addPostDataQueueJob(tenantId, payload)
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
		endpoint: 'delete-scanned-epcs',
		method: HttpMethod.DELETE,
		statusCode: HttpStatus.NO_CONTENT,
		message: 'common.deleted'
	})
	@AuthGuard()
	async deleteEpcBySize(
		@Headers('X-Tenant-Id') tenantId: string,
		@Query(new ZodValidationPipe(deleteEpcValidator)) filters: DeleteEpcBySizeParams
	): Promise<DeleteResult> {
		return await this.rfidService.deleteScannedEpcs(tenantId, filters)
	}
}
