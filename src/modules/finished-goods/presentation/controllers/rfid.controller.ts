import { HttpMethod, Public, RequireAuthorized, RouteHandler } from '@common/decorators'
import { ZodValidationPipe } from '@common/pipes'
import { InjectQueue } from '@nestjs/bullmq'
import {
	BadRequestException,
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
	UseFilters,
	UseInterceptors
} from '@nestjs/common'

import { FileFieldsInterceptor, StorageFile, UploadedFiles } from '@blazity/nest-file-fastify'
import { CommonRequestHeader } from '@common/constants'
import { AllExceptionsFilter } from '@common/filters'
import { CreateEpcChangeStreamCommand } from '@modules/finished-goods/application/commands/create-epc-change-stream/create-epc-change-stream.command'
import { GetInternalEpcsExistsQuery } from '@modules/finished-goods/application/queries/get-internal-epcs-exists/get-internal-epcs-exists.query'
import { FinishedGoodsEpcDocument } from '@modules/finished-goods/infrastructure/persistence/mongodb/schemas/finished-goods-epc.schema'
import { UserRole } from '@modules/user/constants'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { RedisService } from '@redis/redis.service'
import { Queue } from 'bullmq'
import { Cache } from 'cache-manager'
import { format } from 'date-fns'
import { FastifyReply } from 'fastify'
import { PaginateResult } from 'mongoose'
import { z } from 'zod'
import { DeleteScanningEpcsCommand } from '../../application/commands/delete-scanning-epcs/delete-scanning-epcs.command'
import { DeleteScanningMoCommand } from '../../application/commands/delete-scanning-mo/delete-scanning-mo.command'
import { RestoreDeletedEpcsCommand } from '../../application/commands/restore-deleted-epcs/restore-deleted-epcs.command'
import { GetDeletedEpcSpecsQuery } from '../../application/queries/get-deleted-epc-sepcs/get-deleted-epc-specs.query'
import { GetScanningEpcsBySizeQuery } from '../../application/queries/get-scanning-epcs-by-size/get-scanning-epcs-by-size.query'
import { GetScanningEpcsQuery } from '../../application/queries/get-scanning-epcs/get-scanning-epcs.query'
import { GetScanningMosQuery } from '../../application/queries/get-scanning-mo/get-scanning-mo.query'
import { RetriveDeletedEpcsQuery } from '../../application/queries/retrieve-deleted-epcs/retrive-deleted-epcs.query'
import { ScannedOrderDetail, StockFlow } from '../../domain/types'
import {
	IMPORT_DATA_QUEUE,
	POST_DATA_INBOUND_QUEUE,
	POST_DATA_OUTBOUND_QUEUE
} from '../../infrastructure/constants/queue'
import { CsvFileValidationPipe } from '../../infrastructure/pipes/csv-validation.pipe'
import { RFIDSearchParams } from '../../infrastructure/types'
import {
	deleteEpcValidator,
	DeleteScannedEpcDTO,
	FindEpcBySizeDTO as GetEpcBySizeDTO,
	getEpcBySizeValidator,
	PostReaderDataDTO,
	readerPostDataValidator,
	RestoreArchivedEpcsDTO,
	restoreArchivedEpcValidator,
	UploadDataDTO,
	uploadDataValidator
} from '../dto/rfid-shared.dto'

@Controller('rfid')
export class RFIDController {
	constructor(
		@InjectQueue(POST_DATA_INBOUND_QUEUE) private readonly postInboundDataQueue: Queue<PostReaderDataDTO>,
		@InjectQueue(POST_DATA_OUTBOUND_QUEUE) private readonly postOutboundDataQueue: Queue<PostReaderDataDTO>,
		@InjectQueue(IMPORT_DATA_QUEUE) private readonly importDataQueue: Queue,
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
		private readonly eventEmitter: EventEmitter2,
		private readonly redisService: RedisService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	@Get('inbound/sse')
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	@UseFilters(AllExceptionsFilter)
	async streamInboundRFIDData(
		@Headers(CommonRequestHeader.RFID_READER_ID) deviceSerialNumber: string,
		@Query('_page', new DefaultValuePipe(1), ParseIntPipe) page: number,
		@Res()
		reply: FastifyReply & {
			sse: (data: {
				epcs: PaginateResult<FinishedGoodsEpcDocument>
				orders: ScannedOrderDetail[]
				has_invalid: boolean
			}) => void
		}
	) {
		if (!deviceSerialNumber) throw new BadRequestException('Cannot detect RFID device serial number')

		const stockFlow: StockFlow = 'inbound'

		const handleChange = async () => {
			const [epcs, orders, has_invalid] = await Promise.all([
				this.queryBus.execute(
					new GetScanningEpcsQuery(stockFlow, { page: page, limit: 50 }, { inbound_device_sn: deviceSerialNumber })
				),
				this.queryBus.execute(new GetScanningMosQuery(stockFlow, deviceSerialNumber)),
				this.queryBus.execute(new GetInternalEpcsExistsQuery(deviceSerialNumber))
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

	@Get('outbound/sse')
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	@UseFilters(AllExceptionsFilter)
	async streamOutboundRFIDData(
		@Res()
		reply: FastifyReply & {
			sse: (data: {
				epcs: PaginateResult<FinishedGoodsEpcDocument>
				orders: ScannedOrderDetail[]
				// has_invalid: boolean
			}) => void
		}
	) {
		const stockFlow: StockFlow = 'outbound'

		const handleChange = async () => {
			const [epcs, orders] = await Promise.all([
				this.queryBus.execute(new GetScanningEpcsQuery(stockFlow, { page: 1, limit: 50 }, {})),
				this.queryBus.execute(new GetScanningMosQuery(stockFlow))
			])

			reply.sse({ epcs, orders })
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

	@Public()
	@RouteHandler({
		endpoint: 'inbound/post-data',
		method: HttpMethod.POST,
		statusCode: HttpStatus.CREATED,
		message: 'common.created'
	})
	async postInboundData(@Body(new ZodValidationPipe(readerPostDataValidator)) payload: PostReaderDataDTO) {
		const job = await this.postInboundDataQueue.add('BULK_WRITE_SCANNING_INBOUND_DATA', payload, { lifo: true })
		await Promise.all([
			this.eventEmitter.emitAsync('rfid.reader.post_data', {
				deviceSeriesNumber: payload.sn,
				lastUsageTime: format(new Date(), 'yyyy-MM-dd HH:mm:ss.SSS')
			}),
			this.eventEmitter.emitAsync('rfid.inbound.check', payload)
		])

		return job
	}

	@Public()
	@RouteHandler({
		endpoint: 'outbound/post-data',
		method: HttpMethod.POST,
		statusCode: HttpStatus.CREATED,
		message: 'common.created'
	})
	async postOutboundData(@Body(new ZodValidationPipe(readerPostDataValidator)) payload: PostReaderDataDTO) {
		await this.eventEmitter.emitAsync('rfid.reader.post_data', {
			deviceSeriesNumber: payload.sn,
			lastUsageTime: format(new Date(), 'yyyy-MM-dd HH:mm:ss.SSS')
		})

		return await this.postOutboundDataQueue.add('BULK_WRITE_SCANNING_OUTBOUND_DATA', payload)
	}

	@Get('enable-deduplicate-inbound')
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	@UseFilters(AllExceptionsFilter)
	async getIsDeduplicationEnabled(@Res() reply: FastifyReply & { sse: (data: { enabled: boolean }) => void }) {
		const isDeduplicationEnabled = await this.cacheManager.get<boolean>('cached:rfid:enable_deduplicate_inbound_epc')
		reply.sse({ enabled: isDeduplicationEnabled })
		this.redisService.subscribe('enable_deduplicate_inbound_epc', (message) => {
			reply.sse({ enabled: JSON.parse(message) })
		})
	}

	@RouteHandler({ endpoint: 'enable-deduplicate-inbound', method: HttpMethod.PUT })
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	@UseFilters(AllExceptionsFilter)
	async enableDeduplication(
		@Body(new ZodValidationPipe(z.object({ enabled: z.boolean() }))) payload: { enabled: boolean }
	) {
		await this.cacheManager.set<boolean>('cached:rfid:enable_deduplicate_inbound_epc', payload.enabled)
		return await this.redisService.publish('enable_deduplicate_inbound_epc', JSON.stringify(payload.enabled))
	}

	@RouteHandler({
		endpoint: ':stockFlow/scanning-manufacturing-orders',
		method: HttpMethod.GET
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async getOrderDetails(
		@Headers(CommonRequestHeader.RFID_READER_ID) deviceSerialNumber: string | undefined,
		@Param('stockFlow') stockFlow: StockFlow
	) {
		return await this.queryBus.execute(new GetScanningMosQuery(stockFlow, deviceSerialNumber))
	}

	@RouteHandler({
		endpoint: ':stockFlow/paginated-scanning-epcs',
		method: HttpMethod.GET
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async getPaginatedScanningEpcs(
		@Headers(CommonRequestHeader.RFID_READER_ID) deviceSerialNumber: string | undefined,
		@Param('stockFlow') stockFlow: StockFlow,
		@Query('_page', new DefaultValuePipe(1), ParseIntPipe) page: number,
		@Query('mo_no:eq') manufacturingOrder: string | undefined
	) {
		return await this.queryBus.execute(
			new GetScanningEpcsQuery(
				stockFlow,
				{
					page: page,
					limit: 50
				},
				{
					inbound_device_sn: deviceSerialNumber,
					mo_no: manufacturingOrder
				}
			)
		)
	}

	@RouteHandler({
		endpoint: ':stockFlow/scanning-epcs',
		method: HttpMethod.GET
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async getScanningEpcsBySize(
		@Headers(CommonRequestHeader.RFID_READER_ID) deviceSerialNumber: string,
		@Param('stockFlow') stockFlow: StockFlow,
		@Query(new ZodValidationPipe(getEpcBySizeValidator)) query: GetEpcBySizeDTO
	) {
		const manufacturingOrder = query['mo_no:eq']
		const sizeNumber = query['size_numcode:eq']

		return await this.queryBus.execute(
			new GetScanningEpcsBySizeQuery(stockFlow, manufacturingOrder, sizeNumber, deviceSerialNumber)
		)
	}

	@RouteHandler({
		endpoint: ':stockFlow/deleted-epcs',
		method: HttpMethod.GET
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async retrieveDeletedEpcs(
		@Param('stockFlow') stockFlow: 'inbound' | 'outbound',
		@Query('_page', new DefaultValuePipe(1), ParseIntPipe) page: number,
		@Query('_limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
		@Query('scannable:eq', new ParseBoolPipe({ optional: true })) scannable: boolean,
		@Query('scanned:eq', new DefaultValuePipe('scanned')) outboundScanned: 'scanned' | 'unscanned',
		@Query() filterQuery: Omit<RFIDSearchParams, '_page' | '_limit' | 'scannable:eq' | 'scanned:eq'>
	) {
		if (stockFlow !== 'inbound' && stockFlow !== 'outbound') throw new BadRequestException('Invalid type')

		const outboundScannedStatus: Readonly<{ scanned: 'dectectable'; unscanned: 'undetectable' }> = {
			scanned: 'dectectable',
			unscanned: 'undetectable'
		}

		return await this.queryBus.execute(
			new RetriveDeletedEpcsQuery(
				stockFlow,
				{ page, limit },
				{
					epc: filterQuery['epc:contains'],
					mo_no: filterQuery['mo_no:eq'],
					factory_shoes_style: filterQuery['shoes_style:eq'],
					color_sn: filterQuery['color_sn:eq'],
					size_numcode: filterQuery['size_numcode:eq'],
					scannable: scannable,
					outbound_device_sn: outboundScannedStatus[outboundScanned]
				}
			)
		)
	}

	@RouteHandler({
		endpoint: 'deleted-epc-specs',
		method: HttpMethod.GET
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async retrieveDeletedEpcSpecs() {
		return await this.queryBus.execute(new GetDeletedEpcSpecsQuery())
	}

	@RouteHandler({
		endpoint: 'restore-deleted-epcs',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async restoreDeletedEpcs(
		@Body(new ZodValidationPipe(restoreArchivedEpcValidator)) epcs: RestoreArchivedEpcsDTO
	): Promise<void> {
		return await this.commandBus.execute(new RestoreDeletedEpcsCommand(epcs))
	}

	@RouteHandler({
		endpoint: ':stockFlow/scanning-manufacturing-orders/delete/:manufacturingOrder',
		method: HttpMethod.DELETE,
		statusCode: HttpStatus.OK,
		message: 'common.deleted'
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async deleteScanningMo(
		@Param('stockFlow') stockFlow: StockFlow,
		@Param('manufacturingOrder') manufacturingOrder: string,
		@Query('rescannable', new DefaultValuePipe(false), ParseBoolPipe) rescannable: boolean
	) {
		return await this.commandBus.execute(new DeleteScanningMoCommand(stockFlow, manufacturingOrder, rescannable))
	}

	@RouteHandler({
		endpoint: 'scanning-epcs/delete',
		method: HttpMethod.POST,
		statusCode: HttpStatus.OK,
		message: 'common.deleted'
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async deleteScanningEpcs(
		@Query('rescannable', new DefaultValuePipe(false), ParseBoolPipe) rescannable: boolean,
		@Body(new ZodValidationPipe(deleteEpcValidator)) epcs: DeleteScannedEpcDTO
	) {
		return await this.commandBus.execute(new DeleteScanningEpcsCommand(epcs, rescannable))
	}

	@RouteHandler({
		endpoint: 'upload-data',
		method: HttpMethod.POST,
		statusCode: HttpStatus.CREATED,
		message: 'common.created'
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	@UseInterceptors(FileFieldsInterceptor([{ name: 'files', maxCount: 500 }]))
	async uploadDataFile(
		@UploadedFiles(new CsvFileValidationPipe()) files: Array<StorageFile & { buffer: Buffer }>,
		@Body(new ZodValidationPipe(uploadDataValidator)) payload: UploadDataDTO
	) {
		return await this.importDataQueue.add('UPLOAD_DATA', files, { jobId: payload.station })
	}
}
