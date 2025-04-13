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
	UpsertStockInDTO
} from '../dto/rfid.dto'
import { EpcInbound, EpcModel } from '../schemas/epc.schema'
import { RFIDInboundService } from '../services/rfid-inbound.service'
import { RFIDSharedService } from '../services/rfid-shared.service'

@Controller('rfid/inbound')
export class RFIDInboundController {
	private readonly logger = new Logger(RFIDInboundController.name)

	constructor(
		@InjectModel(EpcInbound.name) private readonly epcInboundModel: EpcModel,
		private readonly rfidSharedService: RFIDSharedService,
		private readonly rfidInboundService: RFIDInboundService
	) {}

	@Get('sse')
	@AuthGuard()
	@UseFilters(AllExceptionsFilter)
	async streamInboundRFIDData(@Res() res: Response) {
		res.setHeader('Content-Type', 'text/event-stream')
		res.setHeader('Cache-Control', 'no-cache')
		const handleChange = async () => {
			const data = await this.rfidInboundService.fetchLatestInboundData({ _page: 1, _limit: 50 })
			if (data) {
				res.write(`data: ${JSON.stringify(data)}\n\n`)
				res.flush()
			}
		}
		await handleChange()
		const changeStream = await this.rfidSharedService.captureDataChange(this.epcInboundModel, handleChange)

		res.on('close', async () => {
			this.logger.log('Stop receiving data from Android RFID device')
			await this.rfidInboundService.cleanupQueue()
			changeStream.removeListener('change', handleChange)
			changeStream.close()
			res.end()
		})
	}

	@Api({
		endpoint: 'fetch-epc',
		method: HttpMethod.GET
	})
	@AuthGuard()
	async fetchNextInboundEpc(
		@Query('_page', new DefaultValuePipe(1), ParseIntPipe) page: number,
		@Query('mo_no.eq', new DefaultValuePipe('')) selectedOrder: string
	) {
		return await this.rfidInboundService.getIncomingInboundEpcs({
			_page: page,
			_limit: 50,
			'mo_no.eq': selectedOrder
		})
	}

	@Api({
		endpoint: 'manufacturing-order-detail',
		method: HttpMethod.GET
	})
	@AuthGuard()
	async getOrderDetails() {
		return this.rfidInboundService.getInboundOrderDetails()
	}

	@Api({
		endpoint: 'update-stock/:orderCode',
		method: HttpMethod.PUT,
		statusCode: HttpStatus.CREATED,
		message: 'common.updated'
	})
	@AuthGuard()
	async upsertStockIn(
		@Param('orderCode') orderCode: string,
		@User('username') username: string,
		@Headers('X-User-Company') factoryCode: string,
		@Body(new ZodValidationPipe(updateStockValidator)) payload: UpsertStockInDTO
	) {
		return await this.rfidInboundService.upsertStockIn(orderCode, {
			...payload,
			user_code_created: username,
			factory_code: factoryCode
		})
	}

	@Api({
		endpoint: 'exchange-epc',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: 'common.updated'
	})
	@AuthGuard()
	async exchangeEpc(@Body(new ZodValidationPipe(exchangeOrderValidator)) payload: ExchangeOrderDTO) {
		return await this.rfidInboundService.exchangeEpcByCommandNumber(payload)
	}

	@Api({
		method: HttpMethod.PUT,
		endpoint: 'exchange-epc-by-size'
	})
	@AuthGuard()
	async exchangeEpcBySize(@Body(new ZodValidationPipe(exchangeEpcValidator)) payload: ExchangeEpcDTO) {
		return await this.rfidInboundService.exchangeEpcBySize(payload)
	}

	@Api({
		endpoint: 'delete-scanned-epcs',
		method: HttpMethod.DELETE,
		statusCode: HttpStatus.NO_CONTENT,
		message: 'common.deleted'
	})
	@AuthGuard()
	async deleteEpcBySize(@Query(new ZodValidationPipe(deleteEpcValidator)) filters: DeleteScannedEpcDTO) {
		return await this.rfidInboundService.deleteScannedInboundEpcs(filters)
	}

	@Api({
		endpoint: 'post-data',
		method: HttpMethod.POST,
		statusCode: HttpStatus.CREATED,
		message: 'common.created'
	})
	async postInboundData(@Body(new ZodValidationPipe(readerPostDataValidator)) payload: PostReaderDataDTO) {
		return await this.rfidInboundService.postInboundRFIDData(payload)
	}

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
		return await this.rfidInboundService.searchExchangableOrder({
			'factory_code.eq': factory_code,
			...queries
		} satisfies SearchCustOrderParamsDTO)
	}
}
