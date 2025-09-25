import { CommonRequestHeader } from '@/common/constants'
import { Api, AuthGuard, HttpMethod } from '@/common/decorators'
import { AllExceptionsFilter } from '@/common/filters'
import { ZodValidationPipe } from '@/common/pipes'
import { InjectQueue } from '@nestjs/bullmq'
import {
	Body,
	Controller,
	DefaultValuePipe,
	Get,
	HttpStatus,
	Param,
	ParseBoolPipe,
	ParseIntPipe,
	Query,
	Headers as RequestHeaders,
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
import { POST_DATA_OUTBOUND_QUEUE } from '../constants'

import { UpsertStockOutDTO, upsertStockOutValidator } from '../dto/rfid-outbound.dto'
import {
	deleteEpcValidator,
	DeleteScannedEpcDTO,
	FindEpcBySizeDTO,
	findEpcBySizeValidator,
	PostReaderDataDTO,
	readerPostDataValidator
} from '../dto/rfid-shared.dto'
import { EpcDocument, EpcModel, EpcOutbound } from '../schemas/epc.schema'
import { RFIDOutboundService } from '../services/rfid-outbound.service'
import { RFIDSharedService } from '../services/rfid-shared.service'
import { RFIDSearchParams, ScannedOrderDetail } from '../types'

@Controller('rfid/outbound')
export class RFIDOutboundController {
	constructor(
		@InjectQueue(POST_DATA_OUTBOUND_QUEUE) private readonly postOutboundDataQueue: Queue<PostReaderDataDTO>,
		@InjectModel(EpcOutbound.name) private readonly epcOutboundModel: EpcModel,
		private readonly eventEmitter: EventEmitter2,
		private readonly rfidSharedService: RFIDSharedService,
		private readonly rfidOutboundService: RFIDOutboundService
	) {}

	@Get('sse')
	@AuthGuard()
	@UseFilters(AllExceptionsFilter)
	async streamOutboundRFIDData(
		@RequestHeaders(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
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
			const data = await this.rfidSharedService.fetchLatestData(this.epcOutboundModel, factoryCode, {
				page: 1,
				limit: 50
			})
			if (data) reply.sse(data)
		}
		await handleChange()
		const changeStream = this.rfidSharedService.captureDataChange(this.epcOutboundModel, handleChange)
		reply.raw.on('close', async () => {
			changeStream.removeListener('change', handleChange)
			await changeStream.close()
			reply.raw.end()
		})
	}

	@Api({
		endpoint: 'fetch-epc',
		method: HttpMethod.GET
	})
	@AuthGuard()
	async fetchNextOutboundEpc(
		@RequestHeaders(CommonRequestHeader.FACTORY_CODE) factory: string,
		@Query('_page', new DefaultValuePipe(1), ParseIntPipe) page: number
	) {
		return await this.rfidSharedService.getIncomingEpc(this.epcOutboundModel, factory, { page: page, limit: 50 })
	}

	@Api({
		endpoint: 'get-epc-by-size',
		method: HttpMethod.GET
	})
	@AuthGuard()
	async getOutboundEpcBySize(@Query(new ZodValidationPipe(findEpcBySizeValidator)) queries: FindEpcBySizeDTO) {
		return await this.rfidSharedService.findDeletableEpcs(this.epcOutboundModel, queries)
	}

	@Api({
		endpoint: 'post-data',
		method: HttpMethod.POST,
		statusCode: HttpStatus.CREATED,
		message: 'common.created'
	})
	async postOutboundData(@Body(new ZodValidationPipe(readerPostDataValidator)) payload: PostReaderDataDTO) {
		await this.eventEmitter.emitAsync('rfid.reader.post_data', {
			deviceSeriesNumber: payload.sn,
			lastUsageTime: format(new Date(), 'yyyy-MM-dd HH:mm:ss.SSS')
		})

		return await this.rfidOutboundService.postOutboundRFIDData(payload)
	}

	@Api({
		endpoint: 'update-stock',
		method: HttpMethod.PUT,
		statusCode: HttpStatus.CREATED,
		message: 'common.created'
	})
	async upsertStockOut(
		@RequestHeaders(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@Body(new ZodValidationPipe(upsertStockOutValidator)) payload: UpsertStockOutDTO
	) {
		return await this.rfidOutboundService.upsertStockOut(factoryCode, payload)
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
			this.rfidSharedService.cleanupQueue(this.postOutboundDataQueue),
			this.rfidSharedService.deleteScannedOrder(this.epcOutboundModel, commandNumber, rescannable)
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
			this.rfidSharedService.cleanupQueue(this.postOutboundDataQueue),
			this.rfidSharedService.deleteBulkEpcs(this.epcOutboundModel, epcs, rescannable)
		])
	}

	@Api({
		endpoint: 'archived-epcs',
		method: HttpMethod.GET,
		statusCode: HttpStatus.OK
	})
	@AuthGuard()
	async getArchivedEpcs(
		@RequestHeaders(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@Query('_page', new DefaultValuePipe(1), ParseIntPipe) page: number,
		@Query('_limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
		@Query('q', new DefaultValuePipe('')) search: string,
		@Query('mo_no.eq', new DefaultValuePipe('')) mo_no: string,
		@Query('shoes_style.eq', new DefaultValuePipe('')) shoes_style: string,
		@Query('color_sn.eq', new DefaultValuePipe('')) color_sn: string,
		@Query('size_numcode.eq', new DefaultValuePipe('')) size_numcode: string,
		@Query('scanned.eq', ParseBoolPipe) scanned: string
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
				['scanned.eq']: scanned
			},
			(item) => !isNil(item) && !isEmpty(item)
		) as unknown as RFIDSearchParams & { 'scanned.eq'?: boolean }

		return await this.rfidOutboundService.getArchivedEpcs(factoryCode, filterQuery)
	}
}
