import { CommonRequestHeader } from '@/common/constants'
import { Api, AuthGuard, HttpMethod, User } from '@/common/decorators'
import { AllExceptionsFilter } from '@/common/filters'
import { ZodValidationPipe } from '@/common/pipes'
import { InjectQueue } from '@nestjs/bullmq'
import {
	Body,
	Controller,
	DefaultValuePipe,
	Get,
	Headers,
	HttpStatus,
	Param,
	ParseBoolPipe,
	ParseIntPipe,
	Query,
	Res,
	UseFilters
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { InjectModel } from '@nestjs/mongoose'
import { Queue } from 'bullmq'
import { format } from 'date-fns'
import { FastifyReply } from 'fastify'
import { isEmpty, isNil, pickBy } from 'lodash'
import { PaginateResult } from 'mongoose'
import { PinoLogger } from 'nestjs-pino'
import { POST_DATA_INBOUND_QUEUE } from '../constants'
import {
	deleteEpcValidator,
	DeleteScannedEpcDTO,
	ExchangeOrderDTO,
	exchangeOrderValidator,
	FindEpcBySizeDTO,
	findEpcBySizeValidator,
	PostReaderDataDTO,
	searchCustomerValidator,
	SearchCustOrderParamsDTO,
	updateStockValidator,
	UpsertEpcInformationDTO,
	upsertEpcInformationSchema,
	UpsertStockInDTO
} from '../dto/rfid.dto'
import { EpcDocument, EpcInbound, EpcModel } from '../schemas/epc.schema'
import { RFIDInboundService } from '../services/rfid-inbound.service'
import { RFIDSharedService } from '../services/rfid-shared.service'
import { RFIDSearchParams, ScannedOrderDetail } from '../types'

@Controller('rfid/inbound')
export class RFIDInboundController {
	constructor(
		private readonly logger: PinoLogger,
		@InjectModel(EpcInbound.name) private readonly epcInboundModel: EpcModel,
		@InjectQueue(POST_DATA_INBOUND_QUEUE) private readonly postInboundDataQueue: Queue<PostReaderDataDTO>,
		private readonly eventEmitter: EventEmitter2,
		private readonly rfidSharedService: RFIDSharedService,
		private readonly rfidInboundService: RFIDInboundService
	) {}

	@Get('sse')
	@AuthGuard()
	@UseFilters(AllExceptionsFilter)
	async streamInboundRFIDData(
		@Headers(CommonRequestHeader.FACTORY_CODE) factory: string,
		@Res()
		reply: FastifyReply & {
			sse: (data: {
				epcs: PaginateResult<EpcDocument>
				orders: Array<ScannedOrderDetail>
				has_invalid: boolean
			}) => void
		}
	) {
		const handleChange = async () => {
			const data = await this.rfidSharedService.fetchLatestData(this.epcInboundModel, factory, {
				page: 1,
				limit: 50
			})
			if (data) reply.sse(data)
		}
		await handleChange()
		const changeStream = await this.rfidSharedService.captureDataChange(this.epcInboundModel, handleChange)

		reply.raw.on('close', async () => {
			this.logger.info('Stop receiving data from Android RFID device')
			await this.rfidSharedService.cleanupQueue(this.postInboundDataQueue)
			changeStream.removeListener('change', handleChange)
			changeStream.close()
			reply.raw.end()
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
			page,
			limit: 50,
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
		return await Promise.all([
			this.rfidSharedService.cleanupQueue(this.postInboundDataQueue),
			this.rfidSharedService.deleteScannedOrder(this.epcInboundModel, commandNumber, rescannable)
		])
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
		return await Promise.all([
			this.rfidSharedService.cleanupQueue(this.postInboundDataQueue),
			this.rfidSharedService.deleteBulkEpcs(this.epcInboundModel, epcs, rescannable)
		])
	}

	@Api({
		endpoint: 'post-data',
		method: HttpMethod.POST,
		statusCode: HttpStatus.CREATED,
		message: 'common.created'
	})
	// new ZodValidationPipe(readerPostDataValidator)
	async postInboundData(@Body() payload: PostReaderDataDTO) {
		await this.eventEmitter.emitAsync('rfid.reader.post_data', {
			deviceSeriesNumber: payload.sn,
			lastUsageTime: format(new Date(), 'yyyy-MM-dd HH:mm:ss.SSS')
		})

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

	@Api({
		endpoint: '/retrive-deleted-epcs',
		method: HttpMethod.GET
	})
	async retrieveDeletedEpcs(
		@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@Query('_page', new DefaultValuePipe(1), ParseIntPipe) page: number,
		@Query('_limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
		@Query('q', new DefaultValuePipe('')) search: string,
		@Query('mo_no.eq', new DefaultValuePipe('')) mo_no: string,
		@Query('shoes_style.eq', new DefaultValuePipe('')) shoes_style: string,
		@Query('color_sn.eq', new DefaultValuePipe('')) color_sn: string,
		@Query('size_numcode.eq', new DefaultValuePipe('')) size_numcode: string,
		@Query('scannable.eq', ParseBoolPipe) scannable: string
	) {
		const filterQuery = pickBy(
			{
				page,
				limit,
				q: search,
				['shoes_style.eq']: shoes_style,
				['mo_no.eq']: mo_no,
				['color_sn.eq']: color_sn,
				['size_numcode.eq']: size_numcode,
				['scannable.eq']: scannable
			},
			(item) => !isNil(item) && !isEmpty(item)
		) as RFIDSearchParams

		return await this.rfidInboundService.retrieveDeletedEpcs(factoryCode, filterQuery)
	}
}
