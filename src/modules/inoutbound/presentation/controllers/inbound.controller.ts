import { CommonRequestHeader } from '@/common/constants'
import { HttpMethod, Public, RequestUser, RequireAuthorized, RouteHandler, User } from '@/common/decorators'
import { AllExceptionsFilter } from '@/common/filters'
import { ZodValidationPipe } from '@/common/pipes'
import { EventGateway } from '@/events/event.gateway'
import {
	ExchangeOrderDTO,
	exchangeOrderValidator,
	updateStockInValidator,
	UpsertEpcInformationDTO,
	upsertEpcInformationSchema,
	UpsertStockInDTO
} from '@/modules/inoutbound/presentation/dto/rfid-inbound.dto'
import {
	deleteEpcValidator,
	DeleteScannedEpcDTO,
	FindEpcBySizeDTO,
	findEpcBySizeValidator,
	PostReaderDataDTO,
	readerPostDataValidator,
	searchCustomerValidator,
	SearchCustOrderParamsDTO
} from '@/modules/inoutbound/presentation/dto/rfid-shared.dto'
import { UserRole } from '@/modules/user/constants'
import { RedisService } from '@/redis/redis.service'
import { InjectQueue } from '@nestjs/bullmq'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import {
	Body,
	Controller,
	DefaultValuePipe,
	Get,
	Headers,
	HttpStatus,
	Inject,
	Param,
	ParseBoolPipe,
	ParseIntPipe,
	Query,
	Res,
	UseFilters
} from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { InjectModel } from '@nestjs/mongoose'
import { Queue } from 'bullmq'
import { Cache } from 'cache-manager'
import { FastifyReply } from 'fastify'
import { isEmpty, isNil, pick, pickBy } from 'lodash'
import { PaginateResult } from 'mongoose'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import z from 'zod'
import { GetInternalEpcsExistsQuery } from '../../application/queries/get-internal-epcs-exists/get-internal-epcs-exists.query'
import { GetScanningEpcsQuery } from '../../application/queries/get-scanning-epcs/get-scanning-epcs.query'
import { GetScanningMOsQuery } from '../../application/queries/get-scanning-mo/get-scanning-mo.query'
import { RFIDInboundService } from '../../application/services/rfid-inbound.service'
import { RFIDSharedService } from '../../application/services/rfid-shared.service'
import { ScannedOrderDetail } from '../../domain/types'
import { POST_DATA_INBOUND_QUEUE } from '../../infrastructure/constants/queue'
import {
	EpcInbound,
	EpcModel,
	InventoryEpcDocument
} from '../../infrastructure/persistence/mongodb/schemas/inventory-epc.schema'
import { RFIDSearchParams } from '../../infrastructure/types'

@Controller('rfid/inbound')
export class RFIDInboundController {
	constructor(
		@InjectPinoLogger(RFIDInboundController.name) private readonly logger: PinoLogger,
		@InjectModel(EpcInbound.name) private readonly epcInboundModel: EpcModel,
		@InjectQueue(POST_DATA_INBOUND_QUEUE) private readonly postInboundDataQueue: Queue<PostReaderDataDTO>,
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
		private readonly eventGateway: EventGateway,
		private readonly redisService: RedisService,
		private readonly eventEmitter: EventEmitter2,
		private readonly rfidSharedService: RFIDSharedService,
		private readonly rfidInboundService: RFIDInboundService,
		private readonly queryBus: QueryBus,
		private readonly commandBus: CommandBus
	) {}

	@Get('sse/:device_sn')
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	@UseFilters(AllExceptionsFilter)
	async streamInboundRFIDData(
		@Param('device_sn') device_sn: string,
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
			const [epcs, orders, has_invalid] = await Promise.all([
				this.queryBus.execute(new GetScanningEpcsQuery({ page: 1, limit: 50, 'inbound_device_sn.eq': device_sn })),
				this.queryBus.execute(new GetScanningMOsQuery({ 'inbound_device_sn.eq': device_sn })),
				this.queryBus.execute(new GetInternalEpcsExistsQuery({ 'inbound_device_sn.eq': device_sn }))
			])

			reply.sse({ epcs, orders, has_invalid })
		}

		await handleChange()
		// let currentWatchers = await this.cacheManager.get<number>('cached:rfid:inbound_watchers')
		// await this.cacheManager.set('cached:rfid:inbound_watchers', currentWatchers ? currentWatchers + 1 : 1)
		// currentWatchers = await this.cacheManager.get<number>('cached:rfid:inbound_watchers')
		// this.eventGateway.server.emit('rfid_inbound_watcher', currentWatchers)
		const changeStream = await this.rfidSharedService.captureDataChange(
			{ 'fullDocument.inbound_device_sn': device_sn },
			handleChange
		)

		reply.raw.on('close', async () => {
			// currentWatchers = await this.cacheManager.get<number>('cached:rfid:inbound_watchers')
			// await this.cacheManager.set('cached:rfid:inbound_watchers', currentWatchers > 0 ? currentWatchers - 1 : 0)
			// currentWatchers = await this.cacheManager.get<number>('cached:rfid:inbound_watchers')
			// this.eventGateway.server.emit('rfid_inbound_watcher', currentWatchers)
			// if (currentWatchers === 0) {
			// 	this.logger.info('Stop receiving data from Android RFID device')
			// }
			await this.rfidSharedService.cleanupQueue(this.postInboundDataQueue)
			changeStream.removeListener('change', handleChange)
			changeStream.close()
			reply.raw.end()
		})
	}

	@Get('enable_deduplicate_inbound_epc')
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	@UseFilters(AllExceptionsFilter)
	async getIsDeduplicationEnabled(@Res() reply: FastifyReply & { sse: (data: { enabled: boolean }) => void }) {
		const isDeduplicationEnabled = await this.cacheManager.get<boolean>('cached:rfid:enable_deduplicate_inbound_epc')
		reply.sse({ enabled: isDeduplicationEnabled })
		this.redisService.subscribe('enable_deduplicate_inbound_epc', (message) => {
			reply.sse({ enabled: JSON.parse(message) })
		})
	}

	@RouteHandler({ endpoint: 'enable_deduplicate_inbound_epc', method: HttpMethod.PUT })
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	@UseFilters(AllExceptionsFilter)
	async enableDeduplication(
		@Body(new ZodValidationPipe(z.object({ enabled: z.boolean() }))) payload: { enabled: boolean }
	) {
		await this.cacheManager.set<boolean>('cached:rfid:enable_deduplicate_inbound_epc', payload.enabled)
		return await this.redisService.publish('enable_deduplicate_inbound_epc', JSON.stringify(payload.enabled))
	}

	@RouteHandler({
		endpoint: 'fetch-epc/:device_sn',
		method: HttpMethod.GET
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async fetchNextInboundEpc(
		@Param('device_sn') deviceSerialNumber: string,
		@Query('_page', new DefaultValuePipe(1), ParseIntPipe) page: number,
		@Query('mo_no.eq', new DefaultValuePipe('')) selectedOrder: string
	) {
		return await this.queryBus.execute(
			new GetScanningEpcsQuery({
				page: page,
				limit: 50,
				'mo_no.eq': selectedOrder,
				'inbound_device_sn.eq': deviceSerialNumber
			})
		)
	}

	@RouteHandler({
		endpoint: 'manufacturing-order-detail/:device_sn',
		method: HttpMethod.GET
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async getOrderDetails(@Param('device_sn') device_sn: string) {
		return await this.queryBus.execute(new GetScanningMOsQuery({ 'inbound_device_sn.eq': device_sn }))
	}

	@RouteHandler({
		endpoint: 'get-epc-by-size',
		method: HttpMethod.GET
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async getOutboundEpcBySize(@Query(new ZodValidationPipe(findEpcBySizeValidator)) queries: FindEpcBySizeDTO) {
		return await this.rfidSharedService.findDeletableEpcs(this.epcInboundModel, queries)
	}

	@RouteHandler({
		endpoint: 'update-stock/:commandNumber',
		method: HttpMethod.PUT,
		statusCode: HttpStatus.CREATED,
		message: 'common.updated'
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async upsertStockIn(
		@Param('commandNumber') commandNumber: string,
		@User() user: RequestUser,
		@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@Body(new ZodValidationPipe(updateStockInValidator)) payload: UpsertStockInDTO
	) {
		return await this.rfidInboundService.upsertStockIn(commandNumber, factoryCode, {
			...payload,
			...pick(user, ['username', 'display_name'])
		})
	}

	@RouteHandler({
		endpoint: 'exchange-epc',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: 'common.updated'
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async exchangeEpc(@Body(new ZodValidationPipe(exchangeOrderValidator)) payload: ExchangeOrderDTO) {
		return await this.rfidInboundService.exchangeEpcByCommandNumber(payload)
	}

	@RouteHandler({
		method: HttpMethod.PUT,
		endpoint: 'upsert-epc-information'
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async upsertEpcInformation(
		@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@Body(new ZodValidationPipe(upsertEpcInformationSchema)) payload: UpsertEpcInformationDTO
	) {
		return await this.rfidInboundService.upsertEpcInformation(factoryCode, payload)
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
			this.rfidSharedService.cleanupQueue(this.postInboundDataQueue),
			this.rfidSharedService.deleteScannedOrder(this.epcInboundModel, commandNumber, rescannable)
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
			this.rfidSharedService.cleanupQueue(this.postInboundDataQueue),
			this.rfidSharedService.deleteBulkEpcs(this.epcInboundModel, epcs, rescannable)
		])
	}

	@Public()
	@RouteHandler({
		endpoint: 'post-data',
		method: HttpMethod.POST,
		statusCode: HttpStatus.CREATED,
		message: 'common.created'
	})
	async postInboundData(@Body(new ZodValidationPipe(readerPostDataValidator)) payload: PostReaderDataDTO) {
		// this.eventEmitter.emitAsync('rfid.reader.post_data', {
		// 	deviceSeriesNumber: payload.sn,
		// 	lastUsageTime: format(new Date(), 'yyyy-MM-dd HH:mm:ss.SSS')
		// })
		this.eventEmitter.emitAsync('rfid.inbound.check', payload)
		return await this.postInboundDataQueue.add('RFID_INBOUND', payload, { lifo: true })
	}

	@RouteHandler({
		endpoint: 'search-exchangable-order',
		method: HttpMethod.GET
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
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

	@RouteHandler({
		endpoint: '/retrive-deleted-epcs',
		method: HttpMethod.GET
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
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
