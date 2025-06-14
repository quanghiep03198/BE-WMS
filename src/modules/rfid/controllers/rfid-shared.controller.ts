import { CommonRequestHeader } from '@/common/constants'
import { Api, AuthGuard, HttpMethod } from '@/common/decorators'
import { ZodValidationPipe } from '@/common/pipes'
import { InjectQueue } from '@nestjs/bullmq'
import { Body, Controller, Headers, HttpStatus, Param, UploadedFiles, UseInterceptors } from '@nestjs/common'
import { FileFieldsInterceptor } from '@nestjs/platform-express'
import { Queue } from 'bullmq'
import { IMPORT_DATA_QUEUE } from '../constants'
import { UploadDataDTO, uploadDataValidator } from '../dto/rfid.dto'
import { CsvFileValidationPipe } from '../pipes/csv-validation.pipe'
import { RFIDSharedService } from '../services/rfid-shared.service'

@Controller('rfid')
export class RFIDSharedController {
	constructor(
		@InjectQueue(IMPORT_DATA_QUEUE) private readonly importDataQueue: Queue,
		private readonly rfidSharedService: RFIDSharedService
	) {}

	// #region Others
	@Api({
		endpoint: 'devices',
		method: HttpMethod.GET,
		statusCode: HttpStatus.OK
	})
	@AuthGuard()
	async getWarehouseRFIDDevices(@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string) {
		return await this.rfidSharedService.getWarehouseRFIDDevices(factoryCode)
	}

	@Api({
		endpoint: 'archived-epcs/:commandNumber',
		method: HttpMethod.GET,
		statusCode: HttpStatus.OK
	})
	@AuthGuard()
	async getArchivedEpcsByOrder(
		@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@Param('commandNumber') commandNumber: string
	) {
		return await this.rfidSharedService.getArchivedEpcsByOrder(factoryCode, commandNumber)
	}

	@Api({
		endpoint: 'upload-data',
		method: HttpMethod.POST,
		statusCode: HttpStatus.CREATED,
		message: 'common.created'
	})
	@AuthGuard()
	@UseInterceptors(FileFieldsInterceptor([{ name: 'files', maxCount: 500 }]))
	async uploadDataFile(
		@UploadedFiles(new CsvFileValidationPipe()) files: Express.Multer.File[],
		@Body(new ZodValidationPipe(uploadDataValidator)) payload: UploadDataDTO
	) {
		return await this.importDataQueue.add('UPLOAD_DATA', files, { jobId: payload.station })
	}
}
