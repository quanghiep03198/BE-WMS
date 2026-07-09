import { CommonRequestHeader } from '@/common/constants'
import { HttpMethod, Public, RequestUser, RequireAuthorized, RouteHandler, User } from '@/common/decorators'
import { AllExceptionsFilter } from '@/common/filters'
import { ZodValidationPipe } from '@/common/pipes'
import { DATA_WAREHOUSE_CONNECTION } from '@/databases/constants'
import { UserRole } from '@/modules/user/constants'
import { InjectQueue } from '@nestjs/bullmq'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import {
	Body,
	Controller,
	DefaultValuePipe,
	Get,
	HttpStatus,
	Inject,
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
import { Cache } from 'cache-manager'
import { format } from 'date-fns'
import { FastifyReply } from 'fastify'
import { isEmpty, isNil, pick, pickBy } from 'lodash'
import { PaginateResult } from 'mongoose'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { RFIDOutboundService } from '../../application/services/rfid-outbound.service'
import { RFIDSharedService } from '../../application/services/rfid-shared.service'
import { ScannedOrderDetail } from '../../domain/types'
import { POST_DATA_OUTBOUND_QUEUE } from '../../infrastructure/constants/queue'
import {
	EpcModel,
	EpcOutbound,
	InventoryEpcDocument
} from '../../infrastructure/persistence/mongodb/schemas/inventory-epc.schema'
import { RFIDSearchParams } from '../../infrastructure/types'
import { UpsertStockOutDTO, upsertStockOutValidator } from '../dto/rfid-outbound.dto'
import {
	deleteEpcValidator,
	DeleteScannedEpcDTO,
	FindEpcBySizeDTO,
	findEpcBySizeValidator,
	PostReaderDataDTO,
	readerPostDataValidator
} from '../dto/rfid-shared.dto'

@Controller('rfid/outbound')
export class OutboundController {
	constructor(
		@InjectQueue(POST_DATA_OUTBOUND_QUEUE) private readonly postOutboundDataQueue: Queue<PostReaderDataDTO>,
		@InjectModel(EpcOutbound.name, DATA_WAREHOUSE_CONNECTION) private readonly epcOutboundModel: EpcModel,
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
		@InjectPinoLogger(OutboundController.name) private readonly logger: PinoLogger,
		private readonly eventEmitter: EventEmitter2,
		private readonly rfidSharedService: RFIDSharedService,
		private readonly rfidOutboundService: RFIDOutboundService
	) {}

	@Get('sse')
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	@UseFilters(AllExceptionsFilter)
	async streamOutboundRFIDData(
		@RequestHeaders(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@Res()
		reply: FastifyReply & {
			sse: (data: {
				epcs: PaginateResult<InventoryEpcDocument>
				orders: ScannedOrderDetail[]
				has_invalid: boolean
			}) => void
		}
	) {
		const handleChange = async () => {
			const data = await this.rfidSharedService.fetchLatestData({
				_page: 1,
				_limit: 50
			})
			if (data) reply.sse(data)
		}
		await handleChange()
		const changeStream = this.rfidSharedService.captureDataChange({}, handleChange)
		let currentWatchers = await this.cacheManager.get<number>('cached:rfid:outbound_watchers')
		await this.cacheManager.set('cached:rfid:outbound_watchers', currentWatchers ? currentWatchers + 1 : 1)

		reply.raw.on('close', async () => {
			currentWatchers = await this.cacheManager.get<number>('cached:rfid:outbound_watchers')
			await this.cacheManager.set('cached:rfid:outbound_watchers', currentWatchers - 1)
			currentWatchers = await this.cacheManager.get<number>('cached:rfid:outbound_watchers')
			if (currentWatchers === 0) {
				this.logger.info('Stop receiving data from Android RFID device')
				await this.rfidSharedService.cleanupQueue(this.postOutboundDataQueue)
				changeStream.removeListener('change', handleChange)
				await changeStream.close()
			}
			reply.raw.end()
		})
	}

	@RouteHandler({
		endpoint: 'fetch-epc',
		method: HttpMethod.GET
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async fetchNextOutboundEpc(
		@RequestHeaders(CommonRequestHeader.FACTORY_CODE) factory: string,
		@Query('_page', new DefaultValuePipe(1), ParseIntPipe) page: number
	) {
		return await this.rfidSharedService.getIncomingEpc({ _page: page, _limit: 50 })
	}

	@RouteHandler({
		endpoint: 'get-epc-by-size',
		method: HttpMethod.GET
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async getOutboundEpcBySize(@Query(new ZodValidationPipe(findEpcBySizeValidator)) queries: FindEpcBySizeDTO) {
		return await this.rfidSharedService.findDeletableEpcs(this.epcOutboundModel, queries)
	}

	@Public()
	@RouteHandler({
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

	@RouteHandler({
		endpoint: 'update-stock',
		method: HttpMethod.PUT,
		statusCode: HttpStatus.CREATED,
		message: 'common.created'
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async upsertStockOut(
		@RequestHeaders(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@User() user: RequestUser,
		@Body(new ZodValidationPipe(upsertStockOutValidator)) payload: UpsertStockOutDTO
	) {
		return await this.rfidOutboundService.upsertStockOut(factoryCode, {
			...payload,
			...pick(user, ['username', 'display_name'])
		})
	}

	@RouteHandler({
		endpoint: 'delete-scanned-order/:commandNumber',
		method: HttpMethod.DELETE,
		statusCode: HttpStatus.OK,
		message: 'common.deleted'
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async deleteScannedOutboundEpc(
		@Query('rescannable', new DefaultValuePipe(false), ParseBoolPipe) rescannable: boolean,
		@Param('commandNumber') commandNumber: string
	) {
		return await Promise.all([
			this.rfidSharedService.cleanupQueue(this.postOutboundDataQueue),
			this.rfidSharedService.deleteScannedOrder(this.epcOutboundModel, commandNumber, rescannable)
		])
	}

	@RouteHandler({
		endpoint: 'delete-scanned-epcs',
		method: HttpMethod.POST,
		statusCode: HttpStatus.OK,
		message: 'common.deleted'
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async deleteBulkEpcs(
		@Query('rescannable', new DefaultValuePipe(false), ParseBoolPipe) rescannable: boolean,
		@Body(new ZodValidationPipe(deleteEpcValidator)) epcs: DeleteScannedEpcDTO
	) {
		return await Promise.all([
			this.rfidSharedService.cleanupQueue(this.postOutboundDataQueue),
			this.rfidSharedService.deleteBulkEpcs(this.epcOutboundModel, epcs, rescannable)
		])
	}

	@RouteHandler({
		endpoint: 'archived-epcs',
		method: HttpMethod.GET,
		statusCode: HttpStatus.OK
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async getArchivedEpcs(
		@RequestHeaders(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@Query('_page', new DefaultValuePipe(1), ParseIntPipe) page: number,
		@Query('_limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
		@Query('q', new DefaultValuePipe('')) search: string,
		@Query('mo_no:eq', new DefaultValuePipe('')) mo_no: string,
		@Query('shoes_style:eq', new DefaultValuePipe('')) shoes_style: string,
		@Query('color_sn:eq', new DefaultValuePipe('')) color_sn: string,
		@Query('size_numcode:eq', new DefaultValuePipe('')) size_numcode: string,
		@Query('scanned:eq', ParseBoolPipe) scanned: string
	) {
		const filterQuery = pickBy(
			{
				page,
				limit,
				q: search,
				['shoes_style:eq']: shoes_style,
				['mo_no:eq']: mo_no,
				['color_sn:eq']: color_sn,
				['size_numcode:eq']: size_numcode,
				['scanned:eq']: scanned
			},
			(item) => !isNil(item) && !isEmpty(item)
		) as unknown as RFIDSearchParams & { 'scanned:eq'?: boolean }

		return await this.rfidOutboundService.getArchivedEpcs(factoryCode, filterQuery)
	}
}
