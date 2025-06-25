import { CommonRequestHeader } from '@/common/constants'
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
	ParseBoolPipe,
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
	ExchangeOrderDTO,
	exchangeOrderValidator,
	FindEpcBySizeDTO,
	findEpcBySizeValidator,
	PostReaderDataDTO,
	readerPostDataValidator,
	searchCustomerValidator,
	SearchCustOrderParamsDTO,
	updateStockValidator,
	UpsertEpcInformationDTO,
	upsertEpcInformationSchema,
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
	async streamInboundRFIDData(@Headers(CommonRequestHeader.FACTORY_CODE) factory: string, @Res() res: Response) {
		res.setHeader('Content-Type', 'text/event-stream')
		res.setHeader('Cache-Control', 'no-cache')
		const handleChange = async () => {
			const data = await this.rfidSharedService.fetchLatestData(this.epcInboundModel, factory, {
				_page: 1,
				_limit: 50
			})
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
		@Headers(CommonRequestHeader.FACTORY_CODE) factory: string,
		@Query('_page', new DefaultValuePipe(1), ParseIntPipe) page: number,
		@Query('mo_no.eq', new DefaultValuePipe('')) selectedOrder: string
	) {
		return await this.rfidSharedService.getIncomingEpc(this.epcInboundModel, factory, {
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
	async getOrderDetails(@Headers(CommonRequestHeader.FACTORY_CODE) factory: string) {
		return this.rfidSharedService.getOrderDetail(this.epcInboundModel, factory)
	}

	@Api({
		endpoint: 'get-epc-by-size',
		method: HttpMethod.GET
	})
	@AuthGuard()
	async getOutboundEpcBySize(@Query(new ZodValidationPipe(findEpcBySizeValidator)) queries: FindEpcBySizeDTO) {
		return await this.rfidSharedService.findDeletableEpcs(this.epcInboundModel, queries)
	}

	@Api({
		endpoint: 'update-stock/:commandNumber',
		method: HttpMethod.PUT,
		statusCode: HttpStatus.CREATED,
		message: 'common.updated'
	})
	@AuthGuard()
	async upsertStockIn(
		@Param('commandNumber') commandNumber: string,
		@User('username') username: string,
		@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@Body(new ZodValidationPipe(updateStockValidator)) payload: UpsertStockInDTO
	) {
		return await this.rfidInboundService.upsertStockIn(commandNumber, factoryCode, {
			...payload,
			user_code_created: username
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
		endpoint: 'upsert-epc-information'
	})
	@AuthGuard()
	async upsertEpcInformation(
		@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@Body(new ZodValidationPipe(upsertEpcInformationSchema)) payload: UpsertEpcInformationDTO
	) {
		return await this.rfidInboundService.upsertEpcInformation(factoryCode, payload)
	}

	@Api({
		endpoint: 'delete-scanned-order/:commandNumber',
		method: HttpMethod.DELETE,
		statusCode: HttpStatus.OK,
		message: 'common.deleted'
	})
	@AuthGuard()
	async deleteScannedOutboundEpc(
		@Query('rescannable', new DefaultValuePipe(false), ParseBoolPipe) rescannable: boolean,
		@Param('commandNumber') commandNumber: string
	) {
		return await this.rfidSharedService.deleteScannedOrder(this.epcInboundModel, commandNumber, rescannable)
	}

	@Api({
		endpoint: 'delete-scanned-epcs',
		method: HttpMethod.POST,
		statusCode: HttpStatus.OK,
		message: 'common.deleted'
	})
	@AuthGuard()
	async deleteBulkEpcs(
		@Query('rescannable', new DefaultValuePipe(false), ParseBoolPipe) rescannable: boolean,
		@Body(new ZodValidationPipe(deleteEpcValidator)) epcs: DeleteScannedEpcDTO
	) {
		return await this.rfidSharedService.deleteBulkEpcs(this.epcInboundModel, epcs, rescannable)
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
		@Headers(CommonRequestHeader.FACTORY_CODE) factory_code: string,
		@Query(new ZodValidationPipe(searchCustomerValidator))
		queries: SearchCustOrderParamsDTO
	) {
		return await this.rfidInboundService.searchExchangableOrder({
			'factory_code.eq': factory_code,
			...queries
		} satisfies SearchCustOrderParamsDTO)
	}
}
