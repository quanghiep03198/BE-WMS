import { CommonRequestHeader } from '@common/constants'
import { HttpMethod, Public, RequestUser, RequireAuthorized, RouteHandler, User } from '@common/decorators'
import { AllExceptionsFilter } from '@common/filters'
import { ZodValidationPipe } from '@common/pipes'
import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { UserRole } from '@modules/user/constants'
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
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { InjectModel } from '@nestjs/mongoose'
import { Queue } from 'bullmq'
import { Cache } from 'cache-manager'
import { format } from 'date-fns'
import { FastifyReply } from 'fastify'
import { pick } from 'lodash'
import { PaginateResult } from 'mongoose'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { CreateEpcChangeStreamCommand } from '../../application/commands/create-epc-change-stream/create-epc-change-stream.command'
import { GetScanningEpcsBySizeQuery } from '../../application/queries/get-scanning-epcs-by-size/get-scanning-epcs-by-size.query'
import { GetScanningEpcsQuery } from '../../application/queries/get-scanning-epcs/get-scanning-epcs.query'
import { RFIDOutboundService } from '../../application/services/rfid-outbound.service'
import { RFIDSharedService } from '../../application/services/rfid-shared.service'
import { ScannedOrderDetail } from '../../domain/types'
import { POST_DATA_OUTBOUND_QUEUE } from '../../infrastructure/constants/queue'
import {
	EpcModel,
	EpcOutbound,
	InventoryEpcDocument
} from '../../infrastructure/persistence/mongodb/schemas/inventory-epc.schema'
import { UpsertStockOutDTO, upsertStockOutValidator } from '../dto/rfid-outbound.dto'
import {
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
		private readonly rfidOutboundService: RFIDOutboundService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
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
		const changeStream = await this.commandBus.execute(
			new CreateEpcChangeStreamCommand({ 'fullDocument.outbound_device_sn': { $ne: null } }, handleChange)
		)

		reply.raw.on('close', async () => {
			changeStream.removeListener('change', handleChange)
			await changeStream.close()

			reply.raw.end()
		})
	}

	@RouteHandler({
		endpoint: 'fetch-epc',
		method: HttpMethod.GET
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async fetchNextOutboundEpc(@Query('_page', new DefaultValuePipe(1), ParseIntPipe) page: number) {
		return await this.queryBus.execute(new GetScanningEpcsQuery('outbound', { page, limit: 50 }, {}))
	}

	@RouteHandler({
		endpoint: 'get-epc-by-size',
		method: HttpMethod.GET
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async getOutboundEpcBySize(@Query(new ZodValidationPipe(findEpcBySizeValidator)) queries: FindEpcBySizeDTO) {
		const manufacturingOrder = queries['mo_no:eq']
		const sizeNumber = queries['size_numcode:eq']
		return await this.queryBus.execute(new GetScanningEpcsBySizeQuery('outbound', manufacturingOrder, sizeNumber))
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
}
