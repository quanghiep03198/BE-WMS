import { CommonRequestHeader } from '@/common/constants'
import { HttpMethod, RequireAuthorized, RouteHandler } from '@/common/decorators'
import { ZodValidationPipe } from '@/common/pipes'
import { stringToBoolean } from '@/common/utils'
import { InjectQueue } from '@nestjs/bullmq'
import {
	BadRequestException,
	Body,
	Controller,
	DefaultValuePipe,
	Headers,
	HttpStatus,
	Param,
	ParseIntPipe,
	Query,
	UseInterceptors
} from '@nestjs/common'

import { FileFieldsInterceptor, StorageFile, UploadedFiles } from '@blazity/nest-file-fastify'
import { Queue } from 'bullmq'
import { pickBy } from 'lodash'
import { mongo } from 'mongoose'
import { IMPORT_DATA_QUEUE } from '../../domain/constants'

import { UserRole } from '@/modules/user/constants'
import {
	RestoreArchivedEpcsDTO,
	restoreArchivedEpcValidator,
	UploadDataDTO,
	uploadDataValidator
} from '../../application/dto/rfid-shared.dto'
import { RFIDInboundService } from '../../application/services/rfid-inbound.service'
import { RFIDOutboundService } from '../../application/services/rfid-outbound.service'
import { RFIDSharedService } from '../../application/services/rfid-shared.service'
import { CsvFileValidationPipe } from '../../pipes/csv-validation.pipe'
import { RFIDSearchParams } from '../../types'
import { generateStation } from '../../utils'

@Controller('rfid')
export class RFIDSharedController {
	constructor(
		@InjectQueue(IMPORT_DATA_QUEUE) private readonly importDataQueue: Queue,
		private readonly rfidInboundService: RFIDInboundService,
		private readonly rfidOutboundService: RFIDOutboundService,
		private readonly rfidSharedService: RFIDSharedService
	) {}

	@RouteHandler({
		endpoint: 'archived-epcs/:type',
		method: HttpMethod.GET
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async getArchivedEpcs(
		@Param('type') type: 'inbound' | 'outbound',
		@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@Query('_page', new DefaultValuePipe(1), ParseIntPipe) page: number,
		@Query('_limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
		@Query('q', new DefaultValuePipe('')) search: string,
		@Query('mo_no.eq', new DefaultValuePipe('')) mo_no: string,
		@Query('shoes_style.eq', new DefaultValuePipe('')) shoes_style: string,
		@Query('color_sn.eq', new DefaultValuePipe('')) color_sn: string,
		@Query('size_numcode.eq', new DefaultValuePipe('')) size_numcode: string,
		@Query('scannable.eq') scannable: string,
		@Query('scanned.eq') scanned: string
	) {
		const baseFilterQuery = {
			page,
			limit,
			q: search,
			['shoes_style.eq']: shoes_style,
			['mo_no.eq']: mo_no,
			['color_sn.eq']: color_sn,
			['size_numcode.eq']: size_numcode
		}

		switch (type) {
			case 'inbound': {
				const filterQuery = pickBy(baseFilterQuery, (item) => !!item) as unknown as RFIDSearchParams & {
					'scanned.eq'?: boolean
				}
				return await this.rfidInboundService.retrieveDeletedEpcs(factoryCode, {
					...filterQuery,
					...(!!scannable && { ['scannable.eq']: stringToBoolean(scannable) })
				})
			}

			case 'outbound': {
				const filterQuery = pickBy(baseFilterQuery, (item) => !!item) as unknown as RFIDSearchParams & {
					'scanned.eq'?: boolean
				}
				return await this.rfidOutboundService.getArchivedEpcs(factoryCode, {
					...filterQuery,
					...(!!scanned && { ['scanned.eq']: stringToBoolean(scanned) })
				})
			}
			default:
				throw new BadRequestException('Invalid type')
		}
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
		endpoint: 'restore-archived-epcs/:type',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async restoreArchivedEpcs(
		@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@Body(new ZodValidationPipe(restoreArchivedEpcValidator)) payload: RestoreArchivedEpcsDTO,
		@Param('type') type: 'inbound' | 'outbound'
	): Promise<mongo.BulkWriteResult> {
		if (type !== 'inbound' && type !== 'outbound') throw new BadRequestException('Invalid type')
		const station = generateStation(factoryCode, type === 'inbound' ? 'WH101' : 'WH103')
		const data = payload.map((item) => ({ ...item, station_no: station, factory_code_produce: factoryCode }))
		return await this.rfidSharedService.restoreArchivedEpcs(type, data as RestoreArchivedEpcsDTO)
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
