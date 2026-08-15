import { HttpMethod, Public, RequireAuthorized, RouteHandler } from '@common/decorators'
import { ZodValidationPipe } from '@common/pipes'
import { InjectQueue } from '@nestjs/bullmq'
import {
	BadRequestException,
	Body,
	Controller,
	DefaultValuePipe,
	Headers,
	HttpStatus,
	Inject,
	Param,
	ParseBoolPipe,
	ParseIntPipe,
	Query,
	Sse,
	UseFilters,
	UseInterceptors
} from '@nestjs/common'

import { FileFieldsInterceptor, StorageFile, UploadedFiles } from '@blazity/nest-file-fastify'
import { CommonRequestHeader } from '@common/constants'
import { HttpExceptionFilter } from '@common/filters'
import { CreateEpcChangeStreamCommand } from '@modules/finished-goods/application/commands/create-epc-change-stream/create-epc-change-stream.command'
import { GetInternalEpcsExistsQuery } from '@modules/finished-goods/application/queries/get-internal-epcs-exists/get-internal-epcs-exists.query'
import { IEpcChangeStream } from '@modules/finished-goods/domain/interfaces/epc-change-stream.interface'
import { UserRole } from '@modules/user/constants'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Throttle } from '@nestjs/throttler'
import { RedisService } from '@redis/redis.service'
import { Queue } from 'bullmq'
import { Cache } from 'cache-manager'
import { format } from 'date-fns'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { Observable } from 'rxjs'
import { z } from 'zod'
import { DeleteScanningEpcsCommand } from '../../application/commands/delete-scanning-epcs/delete-scanning-epcs.command'
import { DeleteScanningMoCommand } from '../../application/commands/delete-scanning-mo/delete-scanning-mo.command'
import { RestoreDeletedEpcsCommand } from '../../application/commands/restore-deleted-epcs/restore-deleted-epcs.command'
import { GetDeletedEpcSpecsQuery } from '../../application/queries/get-archived-epc-specs/get-archived-epc-specs.query'
import { GetScanningEpcsBySizeQuery } from '../../application/queries/get-scanning-epcs-by-size/get-scanning-epcs-by-size.query'
import { GetScanningEpcsQuery } from '../../application/queries/get-scanning-epcs/get-scanning-epcs.query'
import { GetScanningMosQuery } from '../../application/queries/get-scanning-mo/get-scanning-mo.query'
import { RetriveArchivedEpcsQuery } from '../../application/queries/retrieve-archived-epcs/retrive-archived-epcs.query'
import { StockFlow } from '../../domain/types'
import { CsvFileValidationPipe } from '../../infrastructure/pipes/csv-validation.pipe'
import {
	BULK_WRITE_INBOUND_EPCS_QUEUE,
	BULK_WRITE_OUTBOUND_EPCS_QUEUE,
	IMPORT_INOUTBOUND_EPCS_QUEUE
} from '../../infrastructure/queues'
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
		@InjectQueue(BULK_WRITE_INBOUND_EPCS_QUEUE) private readonly postInboundDataQueue: Queue<PostReaderDataDTO>,
		@InjectQueue(BULK_WRITE_OUTBOUND_EPCS_QUEUE) private readonly postOutboundDataQueue: Queue<PostReaderDataDTO>,
		@InjectQueue(IMPORT_INOUTBOUND_EPCS_QUEUE) private readonly importDataQueue: Queue,
		@InjectPinoLogger(RFIDController.name) private readonly logger: PinoLogger,
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
		private readonly eventEmitter: EventEmitter2,
		private readonly redisService: RedisService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	@Sse('inbound/sse')
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	@UseFilters(HttpExceptionFilter)
	streamInboundRFIDData(
		@Headers(CommonRequestHeader.RFID_READER_ID) deviceSerialNumber: string,
		@Query('_page', new DefaultValuePipe(1), ParseIntPipe) page: number
	): Observable<any> {
		if (!deviceSerialNumber) throw new BadRequestException('Cannot detect RFID device serial number')

		const stockFlow: StockFlow = 'inbound'

		return new Observable((subscriber) => {
			let changeStream: IEpcChangeStream | undefined

			const handleChange = async () => {
				try {
					const [epcs, orders, has_invalid] = await Promise.all([
						this.queryBus.execute(
							new GetScanningEpcsQuery(
								stockFlow,
								{ page: page, limit: 50 },
								{ inbound_device_sn: deviceSerialNumber }
							)
						),
						this.queryBus.execute(new GetScanningMosQuery(stockFlow, deviceSerialNumber)),
						this.queryBus.execute(new GetInternalEpcsExistsQuery(deviceSerialNumber))
					])

					if (!subscriber.closed) {
						subscriber.next({ data: { epcs, orders, has_invalid } })
					}
				} catch (error) {
					this.logger.error(`Error in inbound RFID stream: ${error}`)
					if (!subscriber.closed) {
						subscriber.error(error)
					}
				}
			}

			const setup = async () => {
				try {
					await handleChange()
					changeStream = await this.commandBus.execute(
						new CreateEpcChangeStreamCommand(
							{ 'fullDocument.inbound_device_sn': deviceSerialNumber },
							handleChange
						)
					)
				} catch (error) {
					this.logger.error(`Error setting up inbound RFID stream: ${error}`)
					if (!subscriber.closed) {
						subscriber.error(error)
					}
				}
			}

			void setup()

			return () => {
				this.logger.info(`Cleaning up inbound RFID stream for device ${deviceSerialNumber}`)
				if (changeStream) void changeStream.close()
				subscriber.complete()
			}
		})
	}

	@Sse('outbound/sse')
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	@UseFilters(HttpExceptionFilter)
	streamOutboundRFIDData(): Observable<any> {
		const stockFlow: StockFlow = 'outbound'

		return new Observable((subscriber) => {
			let changeStream: IEpcChangeStream | undefined

			const handleChange = async () => {
				try {
					const [epcs, orders] = await Promise.all([
						this.queryBus.execute(new GetScanningEpcsQuery(stockFlow, { page: 1, limit: 50 }, {})),
						this.queryBus.execute(new GetScanningMosQuery(stockFlow))
					])

					if (!subscriber.closed) {
						subscriber.next({ data: { epcs, orders } })
					}
				} catch (error) {
					this.logger.error(`Error in outbound RFID stream: ${error}`)
					if (!subscriber.closed) {
						subscriber.error(error)
					}
				}
			}

			const setup = async () => {
				try {
					await handleChange()
					changeStream = await this.commandBus.execute(
						new CreateEpcChangeStreamCommand({ 'fullDocument.outbound_device_sn': { $ne: null } }, handleChange)
					)
				} catch (error) {
					this.logger.error(`Error setting up outbound RFID stream: ${error}`)
					if (!subscriber.closed) {
						subscriber.error(error)
					}
				}
			}

			void setup()

			return () => {
				this.logger.info('Cleaning up outbound RFID stream')
				if (changeStream) {
					void changeStream.close()
				}
				subscriber.complete()
			}
		})
	}

	@Sse('enable-deduplicate-inbound')
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	@UseFilters(HttpExceptionFilter)
	getIsDeduplicationEnabled(): Observable<any> {
		return new Observable((subscriber) => {
			const sendStatus = (enabled: boolean | undefined) => {
				if (!subscriber.closed) {
					subscriber.next({ data: { enabled } })
				}
			}

			const handleMessage = (message: string) => {
				try {
					const enabled = JSON.parse(message)
					sendStatus(enabled)
				} catch (error) {
					this.logger.error(`Error parsing deduplication status message: ${error}`)
				}
			}

			const setup = async () => {
				try {
					const enabled = await this.cacheManager.get<boolean>('cached:rfid:enable_deduplicate_inbound_epc')
					sendStatus(enabled)
					await this.redisService.subscribe('enable_deduplicate_inbound_epc', handleMessage)
				} catch (error) {
					this.logger.error(`Error setting up deduplication status stream: ${error}`)
					if (!subscriber.closed) {
						subscriber.error(error)
					}
				}
			}

			void setup()

			return () => {
				this.logger.info('Cleaning up deduplication status stream')
				void this.redisService.unsubscribe('enable_deduplicate_inbound_epc')
				subscriber.complete()
			}
		})
	}

	@Public()
	@Throttle({ default: { limit: 60, ttl: 60_000 } })
	@RouteHandler({
		endpoint: 'inbound/post-data',
		method: HttpMethod.POST,
		statusCode: HttpStatus.CREATED,
		message: 'common.created'
	})
	async postInboundData(@Body(new ZodValidationPipe(readerPostDataValidator)) payload: PostReaderDataDTO) {
		const job = await this.postInboundDataQueue.add('BULK_WRITE_INBOUND_DATA', payload, { lifo: true })
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
	@Throttle({ default: { limit: 60, ttl: 60_000 } })
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

		return await this.postOutboundDataQueue.add('BULK_WRITE_OUTBOUND_DATA', payload)
	}

	@RouteHandler({ endpoint: 'enable-deduplicate-inbound', method: HttpMethod.PUT })
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	@UseFilters(HttpExceptionFilter)
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
		endpoint: ':stockFlow/archived-epcs',
		method: HttpMethod.GET
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async retrieveArchivedEpcs(
		@Param('stockFlow') stockFlow: 'inbound' | 'outbound',
		@Query('_page', new DefaultValuePipe(1), ParseIntPipe) page: number,
		@Query('_limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
		@Query('scannable:eq', new ParseBoolPipe({ optional: true })) scannable: boolean,
		@Query('scanned:eq', new ParseBoolPipe({ optional: true })) shippedOutScanned: boolean,
		@Query() filterQuery: Omit<RFIDSearchParams, '_page' | '_limit' | 'scannable:eq' | 'scanned:eq'>
	) {
		if (stockFlow !== 'inbound' && stockFlow !== 'outbound') throw new BadRequestException('Invalid type')

		return await this.queryBus.execute(
			new RetriveArchivedEpcsQuery(
				stockFlow,
				{ page, limit },
				{
					epc: filterQuery['epc:contains'],
					mo_no: filterQuery['mo_no:eq'],
					factory_shoes_style: filterQuery['shoes_style:eq'],
					color_sn: filterQuery['color_sn:eq'],
					size_numcode: filterQuery['size_numcode:eq'],
					scannable: scannable,
					po: undefined,
					inbound_times: stockFlow === 'inbound' ? 0 : 1,
					deleted: stockFlow === 'inbound' || shippedOutScanned
					// outbound_device_sn: outboundScannedStatus
				}
			)
		)
	}

	@RouteHandler({
		endpoint: 'archived-epc-specs',
		method: HttpMethod.GET
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async retrieveArchivedEpcSpecs() {
		return await this.queryBus.execute(new GetDeletedEpcSpecsQuery())
	}

	@RouteHandler({
		endpoint: 'restore-archived-epcs',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async restoreArchivedEpcs(
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
