import { HttpMethod, RequireAuthorized, RouteHandler } from '@/common/decorators'
import { ZodValidationPipe } from '@/common/pipes'
import { InjectQueue } from '@nestjs/bullmq'
import {
	BadRequestException,
	Body,
	Controller,
	DefaultValuePipe,
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

import { UserRole } from '@/modules/user/constants'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { DeleteScanningEpcsCommand } from '../../application/commands/delete-scanning-epcs/delete-scanning-epcs.command'
import { RestoreDeletedEpcsCommand } from '../../application/commands/restore-deleted-epcs/restore-deleted-epcs.command'
import { RetriveDeletedEpcsQuery } from '../../application/queries/retrieve-deleted-epcs/retrive-deleted-epcs.query'
import { RFIDSharedService } from '../../application/services/rfid-shared.service'
import { CsvFileValidationPipe } from '../../infrastructure/pipes/csv-validation.pipe'
import { RFIDSearchParams } from '../../infrastructure/types'
import {
	deleteEpcValidator,
	DeleteScannedEpcDTO,
	RestoreArchivedEpcsDTO,
	restoreArchivedEpcValidator,
	UploadDataDTO,
	uploadDataValidator
} from '../dto/rfid-shared.dto'

@Controller('rfid')
export class RFIDSharedController {
	constructor(
		@InjectQueue(IMPORT_DATA_QUEUE) private readonly importDataQueue: Queue,
		private readonly rfidSharedService: RFIDSharedService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	@RouteHandler({
		endpoint: 'archived-epcs/:type',
		method: HttpMethod.GET
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async getArchivedEpcs(
		@Param('type') type: 'inbound' | 'outbound',
		@Query('_page', new DefaultValuePipe(1), ParseIntPipe) page: number,
		@Query('_limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
		@Query('scannable:eq', new ParseBoolPipe({ optional: true })) scannable: boolean | undefined,
		@Query('scanned:eq', new ParseBoolPipe({ optional: true })) outboundScanned: boolean | undefined,
		@Query() filterQuery: Omit<RFIDSearchParams, '_page' | '_limit' | 'scannable:eq' | 'scanned:eq'>
	) {
		if (type !== 'inbound' && type !== 'outbound') throw new BadRequestException('Invalid type')

		return await this.queryBus.execute(
			new RetriveDeletedEpcsQuery(
				type,
				{ page, limit },
				{
					epc: filterQuery['epc:contains'],
					mo_no: filterQuery['mo_no:eq'],
					factory_shoes_style: filterQuery['shoes_style:eq'],
					color_sn: filterQuery['color_sn:eq'],
					size_numcode: filterQuery['size_numcode:eq'],
					scannable: scannable,
					outbound_device_sn: outboundScanned ? 'any' : 'none'
				}
			)
		)
	}

	@RouteHandler({
		endpoint: 'archived-epc-features',
		method: HttpMethod.GET
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async getArchivedEpcFeatures() {
		return await this.rfidSharedService.getArchivedEpcFeatures()
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
		// if (type !== 'inbound' && type !== 'outbound') throw new BadRequestException('Invalid type')
		// const station = generateStation(factoryCode, type === 'inbound' ? 'WH101' : 'WH103')
		// const data = payload.map((item) => ({ ...item, station_no: station, factory_code_produce: factoryCode }))
		// return await this.rfidSharedService.restoreArchivedEpcs(type, data as RestoreArchivedEpcsDTO)
		return await this.commandBus.execute(new RestoreDeletedEpcsCommand(epcs))
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
