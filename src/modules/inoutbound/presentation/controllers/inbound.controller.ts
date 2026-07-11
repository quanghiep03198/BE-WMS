import { CommonRequestHeader } from '@common/constants'
import { HttpMethod, Public, RequestUser, RequireAuthorized, RouteHandler, User } from '@common/decorators'
import { AllExceptionsFilter } from '@common/filters'
import { ZodValidationPipe } from '@common/pipes'
import {
	ExchangeOrderDTO,
	exchangeOrderValidator,
	StockInDTO,
	stockInValidator,
	UpsertEpcInformationDTO,
	upsertEpcInformationSchema
} from '@modules/inoutbound/presentation/dto/rfid-inbound.dto'
import {
	PostReaderDataDTO,
	readerPostDataValidator,
	searchCustomerValidator,
	SearchCustOrderParamsDTO
} from '@modules/inoutbound/presentation/dto/rfid-shared.dto'
import { UserRole } from '@modules/user/constants'
import { InjectQueue } from '@nestjs/bullmq'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import {
	BadRequestException,
	Body,
	Controller,
	DefaultValuePipe,
	Get,
	Headers,
	HttpStatus,
	Inject,
	ParseIntPipe,
	Query,
	Res,
	UseFilters
} from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { RedisService } from '@redis/redis.service'
import { Queue } from 'bullmq'
import { Cache } from 'cache-manager'
import { FastifyReply } from 'fastify'
import { PaginateResult } from 'mongoose'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import z from 'zod'
import { CreateEpcChangeStreamCommand } from '../../application/commands/create-epc-change-stream/create-epc-change-stream.command'
import { ExchangeMoRmCommand } from '../../application/commands/exchange-mo/impl/exchange-mo-rm.command'
import { StockInCommand } from '../../application/commands/stock-in/stock-in.command'
import { UpsertEpcInfoCommand } from '../../application/commands/upsert-epc-info/upsert-epc-info.command'
import { GetInternalEpcsExistsQuery } from '../../application/queries/get-internal-epcs-exists/get-internal-epcs-exists.query'
import { GetScanningEpcsQuery } from '../../application/queries/get-scanning-epcs/get-scanning-epcs.query'
import { GetScanningMosQuery } from '../../application/queries/get-scanning-mo/get-scanning-mo.query'
import { SearchExchangableMoQuery } from '../../application/queries/search-exchangable-mo/search-exchangable-mo.query'
import { ScannedOrderDetail } from '../../domain/types'
import { POST_DATA_INBOUND_QUEUE } from '../../infrastructure/constants/queue'
import { InventoryEpcDocument } from '../../infrastructure/persistence/mongodb/schemas/inventory-epc.schema'

@Controller('rfid/inbound')
export class RFIDInboundController {
	constructor(
		@InjectPinoLogger(RFIDInboundController.name) private readonly logger: PinoLogger,
		@InjectQueue(POST_DATA_INBOUND_QUEUE) private readonly postInboundDataQueue: Queue<PostReaderDataDTO>,
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
		private readonly redisService: RedisService,
		private readonly eventEmitter: EventEmitter2,
		private readonly queryBus: QueryBus,
		private readonly commandBus: CommandBus
	) {}

	@Get('sse')
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	@UseFilters(AllExceptionsFilter)
	async streamInboundRFIDData(
		@Headers(CommonRequestHeader.RFID_READER_ID) deviceSerialNumber: string,
		@Query('_page', new DefaultValuePipe(1), ParseIntPipe) page: number,
		@Res()
		reply: FastifyReply & {
			sse: (data: {
				epcs: PaginateResult<InventoryEpcDocument>
				orders: ScannedOrderDetail[]
				has_invalid: boolean
			}) => void
		}
	) {
		if (!deviceSerialNumber) throw new BadRequestException('Cannot detect RFID device serial number')

		const stockFlow = 'inbound' as const

		const handleChange = async () => {
			const [epcs, orders, has_invalid] = await Promise.all([
				this.queryBus.execute(
					new GetScanningEpcsQuery(stockFlow, { page: page, limit: 50 }, { inbound_device_sn: deviceSerialNumber })
				),
				this.queryBus.execute(new GetScanningMosQuery(stockFlow, deviceSerialNumber)),
				this.queryBus.execute(new GetInternalEpcsExistsQuery({ 'inbound_device_sn:eq': deviceSerialNumber }))
			])

			reply.sse({ epcs, orders, has_invalid })
		}

		await handleChange()

		const changeStream = await this.commandBus.execute(
			new CreateEpcChangeStreamCommand({ 'fullDocument.inbound_device_sn': deviceSerialNumber }, handleChange)
		)

		reply.raw.on('close', async () => {
			changeStream.removeListener('change', handleChange)
			changeStream.close()
			reply.raw.end()
		})
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
		return await this.postInboundDataQueue.add('BULK_WRITE_SCANNING_INBOUND_DATA', payload, { lifo: true })
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
		endpoint: 'stock-in',
		method: HttpMethod.PUT,
		statusCode: HttpStatus.CREATED,
		message: 'common.updated'
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async stockIn(
		@User() user: RequestUser,
		@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@Body(new ZodValidationPipe(stockInValidator)) payload: StockInDTO
	) {
		return await this.commandBus.execute(
			new StockInCommand({
				...payload,
				factory_code_produce: factoryCode,
				username: user.username,
				display_name: user.display_name
			})
		)
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
		return await this.queryBus.execute(new SearchExchangableMoQuery(queries.q, factory_code, queries['color_sn:eq']))
	}

	@RouteHandler({
		endpoint: 'exchange-epc',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: 'common.updated'
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async exchangeEpc(
		@Headers(CommonRequestHeader.RFID_READER_ID) deviceSerialNumber: string,
		@Body(new ZodValidationPipe(exchangeOrderValidator)) payload: ExchangeOrderDTO
	) {
		return await this.commandBus.execute(
			new ExchangeMoRmCommand(deviceSerialNumber, payload.mo_no.split(','), payload.mo_no_actual)
		)
	}

	@RouteHandler({
		method: HttpMethod.PUT,
		endpoint: 'upsert-epc-information'
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async upsertEpcInformation(
		@Headers(CommonRequestHeader.RFID_READER_ID) deviceSerialNumber: string,
		@Body(new ZodValidationPipe(upsertEpcInformationSchema)) payload: UpsertEpcInformationDTO
	) {
		return await this.commandBus.execute(
			new UpsertEpcInfoCommand(
				deviceSerialNumber,
				payload.mo_no,
				payload.mo_no_actual,
				payload.mo_noseq,
				payload.size_numcode,
				payload.quantity
			)
		)
	}
}
