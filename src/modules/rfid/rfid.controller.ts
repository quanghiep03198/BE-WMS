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
import { InjectModel } from '@nestjs/mongoose'
import { Response } from 'express'
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

	// #region Inbound

	@Get('inbound/sse')
	@AuthGuard()
	@UseFilters(AllExceptionsFilter)
	async streamInboundRFIDData(@Res() res: Response) {
		res.setHeader('Content-Type', 'text/event-stream')
		res.setHeader('Cache-Control', 'no-cache')
		const handleChange = async () => {
			const data = await this.rfidService.fetchLatestInboundData({ _page: 1, _limit: 50 })
			if (data) {
				res.write(`data: ${JSON.stringify(data)}\n\n`)
				res.flush()
			}
		}
		await handleChange()
		const changeStream = await this.rfidService.captureDataChange(this.epcInboundModel, handleChange)

		res.on('close', async () => {
			this.logger.log('Stop receiving data from Android RFID device')
			await this.rfidService.cleanupQueue()
			changeStream.removeListener('change', handleChange)
			changeStream.close()
			res.end()
		})
	}

	@Api({
		endpoint: 'inbound/fetch-epc',
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
		endpoint: 'inbound/manufacturing-order-detail',
		method: HttpMethod.GET
	})
	@AuthGuard()
	async getOrderDetails() {
		return this.rfidService.getInboundOrderDetails()
	}

	@Api({
		endpoint: 'inbound/update-stock/:orderCode',
		method: HttpMethod.PUT,
		statusCode: HttpStatus.CREATED,
		message: 'common.updated'
	})
	@AuthGuard()
	async upsertStockIn(
		@Param('orderCode') orderCode: string,
		@User('username') username: string,
		@Headers('X-User-Company') factoryCode: string,
		@Body(new ZodValidationPipe(updateStockValidator)) payload: UpsertStockDTO
	) {
		return await this.rfidService.upsertStockIn(orderCode, {
			...payload,
			user_code_created: username,
			factory_code: factoryCode
		})
	}

	@Api({
		endpoint: 'inbound/exchange-epc',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: 'common.updated'
	})
	@AuthGuard()
	async exchangeEpc(@Body(new ZodValidationPipe(exchangeOrderValidator)) payload: ExchangeOrderDTO) {
		return await this.rfidService.exchangeEpcByCommandNumber(payload)
	}

	@Api({
		method: HttpMethod.PUT,
		endpoint: 'inbound/exchange-epc-by-size'
	})
	@AuthGuard()
	async exchangeEpcBySize(@Body(new ZodValidationPipe(exchangeEpcValidator)) payload: ExchangeEpcDTO) {
		return await this.rfidService.exchangeEpcBySize(payload)
	}

	@Api({
		endpoint: 'inbound/delete-scanned-epcs',
		method: HttpMethod.DELETE,
		statusCode: HttpStatus.NO_CONTENT,
		message: 'common.deleted'
	})
	@AuthGuard()
	async deleteEpcBySize(@Query(new ZodValidationPipe(deleteEpcValidator)) filters: DeleteScannedEpcDTO) {
		return await this.rfidService.deleteScannedInboundEpcs(filters)
	}

	@Api({
		endpoint: '/inbound/post-data',
		method: HttpMethod.POST,
		statusCode: HttpStatus.CREATED,
		message: 'common.created'
	})
	async postInboundData(@Body(new ZodValidationPipe(readerPostDataValidator)) payload: PostReaderDataDTO) {
		return await this.rfidService.addPostDataQueueJob(payload)
	}
	// #endregion

	// #region Outbound
	@Get('outbound/sse')
	@AuthGuard()
	@UseFilters(AllExceptionsFilter)
	async streamOutboundRFIDData(@Res() res: Response) {
		res.setHeader('Content-Type', 'text/event-stream')
		res.setHeader('Cache-Control', 'no-cache')
		const handleChange = async () => {
			const data = await this.rfidService.fetchLatestOutboundData({ _page: 1, _limit: 50 })
			if (data) {
				res.write(`data: ${JSON.stringify(data)}\n\n`)
				res.flush()
			}
		}
		await handleChange()
		const changeStream = this.rfidService.captureDataChange(this.epcOutboundModel, handleChange)
		res.on('close', () => {
			this.logger.log('Stop receiving data from Android RFID device')
			changeStream.removeListener('change', postMessage)
			changeStream.close()
			res.end()
		})
	}

	@Api({
		endpoint: 'outbound/fetch-epc',
		method: HttpMethod.GET
	})
	@AuthGuard()
	async fetchNextOutboundEpc(@Query('_page', new DefaultValuePipe(1), ParseIntPipe) page: number) {
		return await this.rfidService.getIncomingOutboundEpcs({ _page: page, _limit: 50 })
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
		endpoint: 'outbound/update-stock',
		method: HttpMethod.PUT,
		statusCode: HttpStatus.CREATED,
		message: 'common.created'
	})
	async upsertStockOut(@Body() payload: any) {
		return await this.rfidService.upsertStockOut(payload)
	}

	@Api({
		endpoint: 'outbound/delete-scanned-epcs',
		method: HttpMethod.DELETE,
		statusCode: HttpStatus.NO_CONTENT,
		message: 'common.created'
	})
	@AuthGuard()
	async deleteScannedOutboundEpc(@Query(new ZodValidationPipe(deleteEpcValidator)) filters: DeleteScannedEpcDTO) {
		return await this.rfidService.deleteScannedOutboundEpcs(filters)
	}
	// #endregion

	// #region Others
	@Api({
		endpoint: 'search-exchangable-order',
		method: HttpMethod.GET
	})
	@AuthGuard()
	async searchExchangableOrder(
		@Headers('X-User-Company') factory_code: string,
		@Query(new ZodValidationPipe(searchCustomerValidator))
		queries: SearchCustOrderParamsDTO
	) {
		return await this.rfidService.searchExchangableOrder({
			'factory_code.eq': factory_code,
			...queries
		} satisfies SearchCustOrderParamsDTO)
	}
}
