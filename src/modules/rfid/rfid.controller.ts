import { Api, HttpMethod } from '@/common/decorators/api.decorator'
import { AuthGuard } from '@/common/decorators/auth.decorator'
import { User } from '@/common/decorators/user.decorator'
import { AllExceptionsFilter } from '@/common/filters/exceptions.filter'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'
import { InjectQueue } from '@nestjs/bullmq'
import {
	Body,
	Controller,
	DefaultValuePipe,
	Get,
	Headers,
	HttpStatus,
	Logger,
	Param,
	ParseIntPipe,
	Query,
	Res,
	UseFilters
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Queue } from 'bullmq'
import { Response } from 'express'
import { uniqBy } from 'lodash'
import { DeleteResult, PaginateModel } from 'mongoose'
import { THIRD_PARTY_API_SYNC } from '../third-party-api/constants'
import { FALLBACK_VALUE } from './constants'
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
	private readonly logger = new Logger(RFIDController.name)

	constructor(
		@InjectModel(Epc.name) private readonly epcModel: PaginateModel<EpcDocument>,
		@InjectQueue(THIRD_PARTY_API_SYNC) private readonly thirdPartyApiSyncQueue: Queue,
		private readonly rfidService: RFIDService
	) {}

	@Get('sse')
	@AuthGuard()
	@UseFilters(AllExceptionsFilter)
	async streamRFIDData(@Headers('X-Tenant-Id') tenantId: string, @Res() res: Response) {
		res.setHeader('Content-Type', 'text/event-stream')
		res.setHeader('Cache-Control', 'no-cache')

		const postMessage = (data) => {
			res.write(`data: ${JSON.stringify(data)}\n\n`)
			res.flush()
		}

		const data = await this.rfidService.fetchLatestData({ _page: 1, _limit: 50 })
		postMessage(data)

		this.rfidService.captureDataChange(async () => {
			const data = await this.rfidService.fetchLatestData({ _page: 1, _limit: 50 })
			if (data) postMessage(data)
		})

		res.on('close', () => {
			this.rfidService.cleanupQueue(tenantId)
			this.logger.log('Stop receiving data from Android RFID device')
			res.end()
		})
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

	@Api({
		endpoint: 'sync-decker-data',
		method: HttpMethod.PUT,
		statusCode: HttpStatus.CREATED,
		message: 'common.created'
	})
	@AuthGuard()
	async syncDeckerData(@Headers('X-Tenant-Id') tenantId: string, @Headers('X-User-Company') factoryCode: string) {
		const validUnknownEpcs = await this.epcModel.find({ tenant_id: tenantId, mo_no: FALLBACK_VALUE }).lean(true)
		return await this.thirdPartyApiSyncQueue.add(
			tenantId,
			uniqBy(validUnknownEpcs, (item) => item.epc.substring(0, 22)).map((item) => item.epc),
			{
				jobId: factoryCode,
				removeOnComplete: true
			}
		)
	}
}
