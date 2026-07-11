import { HttpMethod, RequireAuthorized, RouteHandler } from '@common/decorators'
import { ZodValidationPipe } from '@common/pipes'
import { InjectQueue } from '@nestjs/bullmq'
import {
	BadRequestException,
	Body,
	Controller,
	DefaultValuePipe,
	Headers,
	HttpStatus,
	Param,
	ParseBoolPipe,
	ParseIntPipe,
	Query,
	UseInterceptors
} from '@nestjs/common'

import { FileFieldsInterceptor, StorageFile, UploadedFiles } from '@blazity/nest-file-fastify'
import { Queue } from 'bullmq'
import { IMPORT_DATA_QUEUE } from '../../infrastructure/constants/queue'

import { CommonRequestHeader } from '@/common/constants'
import { UserRole } from '@modules/user/constants'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { DeleteScanningEpcsCommand } from '../../application/commands/delete-scanning-epcs/delete-scanning-epcs.command'
import { DeleteScanningMoCommand } from '../../application/commands/delete-scanning-mo/delete-scanning-mo.command'
import { RestoreDeletedEpcsCommand } from '../../application/commands/restore-deleted-epcs/restore-deleted-epcs.command'
import { GetDeletedEpcSpecsQuery } from '../../application/queries/get-deleted-epc-sepcs/get-deleted-epc-specs.query'
import { GetScanningEpcsBySizeQuery } from '../../application/queries/get-scanning-epcs-by-size/get-scanning-epcs-by-size.query'
import { GetScanningEpcsQuery } from '../../application/queries/get-scanning-epcs/get-scanning-epcs.query'
import { GetScanningMosQuery } from '../../application/queries/get-scanning-mo/get-scanning-mo.query'
import { RetriveDeletedEpcsQuery } from '../../application/queries/retrieve-deleted-epcs/retrive-deleted-epcs.query'
import { StockFlow } from '../../domain/types'
import { CsvFileValidationPipe } from '../../infrastructure/pipes/csv-validation.pipe'
import { RFIDSearchParams } from '../../infrastructure/types'
import {
	deleteEpcValidator,
	DeleteScannedEpcDTO,
	FindEpcBySizeDTO as GetEpcBySizeDTO,
	getEpcBySizeValidator,
	RestoreArchivedEpcsDTO,
	restoreArchivedEpcValidator,
	UploadDataDTO,
	uploadDataValidator
} from '../dto/rfid-shared.dto'

@Controller('rfid')
export class RFIDSharedController {
	constructor(
		@InjectQueue(IMPORT_DATA_QUEUE) private readonly importDataQueue: Queue,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	@RouteHandler({
		endpoint: ':stockFlow/scanning-mos',
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
	async fetchNextInboundEpc(
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
		endpoint: ':stockFlow/scanning-epcs-by-size',
		method: HttpMethod.GET
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async getOutboundEpcBySize(
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
	async getArchivedEpcs(
		@Param('stockFlow') stockFlow: 'inbound' | 'outbound',
		@Query('_page', new DefaultValuePipe(1), ParseIntPipe) page: number,
		@Query('_limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
		@Query('scannable:eq', new ParseBoolPipe({ optional: true })) scannable: boolean | undefined,
		@Query('scanned:eq', new ParseBoolPipe({ optional: true })) outboundScanned: boolean | undefined,
		@Query() filterQuery: Omit<RFIDSearchParams, '_page' | '_limit' | 'scannable:eq' | 'scanned:eq'>
	) {
		if (stockFlow !== 'inbound' && stockFlow !== 'outbound') throw new BadRequestException('Invalid type')

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
					outbound_device_sn: outboundScanned ? 'dectectable' : 'undetectable'
				}
			)
		)
	}

	@RouteHandler({
		endpoint: 'deleted-epc-specs',
		method: HttpMethod.GET
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async getDeletedEpcSpecs() {
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
		endpoint: 'delete-scanning-mo/:stockFlow/:manufacturingOrder',
		method: HttpMethod.DELETE,
		statusCode: HttpStatus.OK,
		message: 'common.deleted'
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async deleteScannedOutboundEpc(
		@Param('stockFlow') stockFlow: StockFlow,
		@Param('manufacturingOrder') manufacturingOrder: string,
		@Query('rescannable', new DefaultValuePipe(false), ParseBoolPipe) rescannable: boolean
	) {
		return await this.commandBus.execute(new DeleteScanningMoCommand(stockFlow, manufacturingOrder, rescannable))
	}

	@RouteHandler({
		endpoint: 'delete-scanning-epcs',
		method: HttpMethod.POST,
		statusCode: HttpStatus.OK,
		message: 'common.deleted'
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async deleteBulkEpcs(
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
