import { Api, AuthGuard, HttpMethod, User } from '@/common/decorators'
import { AllExceptionsFilter } from '@/common/filters'
import { ZodValidationPipe } from '@/common/pipes'
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
import { Response } from 'express'

import { InjectModel } from '@nestjs/mongoose'
import {
	deleteEpcValidator,
	DeleteScannedEpcDTO,
	ExchangeEpcDTO,
	exchangeEpcValidator,
	ExchangeOrderDTO,
	exchangeOrderValidator,
	PostReaderDataDTO,
	readerPostDataValidator,
	searchCustomerValidator,
	SearchCustOrderParamsDTO,
	updateStockValidator,
	UpsertStockDTO
} from './dto/rfid.dto'
import { RFIDService } from './rfid.service'
import { EpcInbound, EpcModel, EpcOutbound } from './schemas/epc.schema'

/**
 * @description Controller for Finished Production Inventory (FPI)
 */

@Controller('rfid')
export class RFIDController {
	private readonly logger = new Logger(RFIDController.name)

	constructor(
		@InjectModel(EpcInbound.name) private readonly epcInboundModel: EpcModel,
		@InjectModel(EpcOutbound.name) private readonly epcOutboundModel: EpcModel,
		private readonly rfidService: RFIDService
	) {}

	@Get('sse/inbound')
	@AuthGuard()
	@UseFilters(AllExceptionsFilter)
	async streamInboundRFIDData(@Res() res: Response) {
		res.setHeader('Content-Type', 'text/event-stream')
		res.setHeader('Cache-Control', 'no-cache')

		const postMessage = (data) => {
			res.write(`data: ${JSON.stringify(data)}\n\n`)
			res.flush()
		}

		const data = await this.rfidService.fetchLatestInboundData({ _page: 1, _limit: 50 })
		postMessage(data)

		const listener = await this.rfidService.captureDataChange(this.epcInboundModel, async () => {
			const data = await this.rfidService.fetchLatestInboundData({ _page: 1, _limit: 50 })
			if (data) postMessage(data)
		})

		res.on('close', () => {
			this.logger.log('Stop receiving data from Android RFID device')
			listener.removeListener('change', () => this.rfidService.cleanupQueue())
			res.end()
		})
	}

	@Get('sse/outbound')
	@AuthGuard()
	@UseFilters(AllExceptionsFilter)
	async streamOutboundRFIDData(@Res() res: Response) {
		res.setHeader('Content-Type', 'text/event-stream')
		res.setHeader('Cache-Control', 'no-cache')

		const postMessage = (data) => {
			res.write(`data: ${JSON.stringify(data)}\n\n`)
			res.flush()
		}

		const data = await this.rfidService.fetchLatestOutboundData({ _page: 1, _limit: 50 })
		postMessage(data)

		this.rfidService.captureDataChange(this.epcOutboundModel, async () => {
			const data = await this.rfidService.fetchLatestOutboundData({ _page: 1, _limit: 50 })
			if (data) postMessage(data)
		})

		res.on('close', () => {
			this.logger.log('Stop receiving data from Android RFID device')
			res.end()
		})
	}

	@Api({
		endpoint: 'fetch-epc/inbound',
		method: HttpMethod.GET
	})
	@AuthGuard()
	async fetchNextInboundEpc(
		@Query('_page', new DefaultValuePipe(1), ParseIntPipe) page: number,
		@Query('mo_no.eq', new DefaultValuePipe('')) selectedOrder: string
	) {
		return await this.rfidService.getIncomingInboundEpcs({ _page: page, _limit: 50, 'mo_no.eq': selectedOrder })
	}

	@Api({
		endpoint: 'fetch-epc/outbound',
		method: HttpMethod.GET
	})
	@AuthGuard()
	async fetchNextOutboundEpc(
		@Query('_page', new DefaultValuePipe(1), ParseIntPipe) page: number,
		@Query('mo_no.eq', new DefaultValuePipe('')) selectedOrder: string
	) {
		return await this.rfidService.getIncomingOutboundEpcs({ _page: page, _limit: 50, 'mo_no.eq': selectedOrder })
	}

	@Api({
		endpoint: 'manufacturing-order-detail',
		method: HttpMethod.GET
	})
	@AuthGuard()
	async getOrderDetails() {
		return this.rfidService.getInboundOrderDetails()
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
	async postInboundData(
		@Param('tenantId') tenantId: string,
		@Body(new ZodValidationPipe(readerPostDataValidator)) payload: PostReaderDataDTO
	) {
		return await this.rfidService.addPostDataQueueJob(tenantId, payload)
	}

	@Api({
		endpoint: 'outbound/post-data',
		method: HttpMethod.POST,
		statusCode: HttpStatus.CREATED,
		message: 'common.created'
	})
	async postOutboundData(@Body(new ZodValidationPipe(readerPostDataValidator)) payload: PostReaderDataDTO) {
		return await this.rfidService.storeOutboundData(payload)
	}

	@Api({
		endpoint: 'exchange-epc',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: 'common.updated'
	})
	@AuthGuard()
	async exchangeEpc(@Body(new ZodValidationPipe(exchangeOrderValidator)) payload: ExchangeOrderDTO) {
		return await this.rfidService.exchangeEpcByCommandNumber(payload)
	}

	@Api({
		endpoint: '/inbound/delete-scanned-epcs',
		method: HttpMethod.DELETE,
		statusCode: HttpStatus.NO_CONTENT,
		message: 'common.deleted'
	})
	@AuthGuard()
	async deleteEpcBySize(@Query(new ZodValidationPipe(deleteEpcValidator)) filters: DeleteScannedEpcDTO) {
		return await this.rfidService.deleteScannedInboundEpcs(filters)
	}

	@Api({
		method: HttpMethod.PUT,
		endpoint: '/exchange-epc-by-size'
	})
	async exchangeEpcBySize(@Body(new ZodValidationPipe(exchangeEpcValidator)) payload: ExchangeEpcDTO) {
		return await this.rfidService.exchangeEpcBySize(payload)
	}
}
