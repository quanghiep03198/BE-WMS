import { Api, AuthGuard, HttpMethod } from '@/common/decorators'
import { AllExceptionsFilter } from '@/common/filters'
import { ZodValidationPipe } from '@/common/pipes'
import {
	Body,
	Controller,
	DefaultValuePipe,
	Get,
	Headers,
	HttpStatus,
	Param,
	ParseBoolPipe,
	ParseIntPipe,
	Query,
	Res,
	UseFilters
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Response } from 'express'
import {
	deleteEpcValidator,
	DeleteScannedEpcDTO,
	FindEpcBySizeDTO,
	findEpcBySizeValidator,
	PostReaderDataDTO,
	readerPostDataValidator,
	RestoreArchivedEpcsDTO,
	restoreArchivedEpcValidator,
	UpsertStockOutDTO,
	upsertStockOutValidator
} from '../dto/rfid.dto'
import { EpcModel, EpcOutbound } from '../schemas/epc.schema'
import { RFIDOutboundService } from '../services/rfid-outbound.service'
import { RFIDSharedService } from '../services/rfid-shared.service'

@Controller('rfid/outbound')
export class RFIDOutboundController {
	constructor(
		@InjectModel(EpcOutbound.name) private readonly epcOutboundModel: EpcModel,
		private readonly rfidSharedService: RFIDSharedService,
		private readonly rfidOutboundService: RFIDOutboundService
	) {}

	@Get('sse')
	@AuthGuard()
	@UseFilters(AllExceptionsFilter)
	async streamOutboundRFIDData(@Headers('X-User-Company') factoryCode: string, @Res() res: Response) {
		res.setHeader('Content-Type', 'text/event-stream')
		res.setHeader('Cache-Control', 'no-cache')
		const handleChange = async () => {
			const data = await this.rfidSharedService.fetchLatestData(this.epcOutboundModel, factoryCode, {
				_page: 1,
				_limit: 50
			})
			if (data) {
				res.write(`data: ${JSON.stringify(data)}\n\n`)
				res.flush()
			}
		}
		await handleChange()
		const changeStream = this.rfidSharedService.captureDataChange(this.epcOutboundModel, handleChange)
		res.on('close', async () => {
			changeStream.removeListener('change', handleChange)
			await changeStream.close()
			res.end()
		})
	}

	@Api({
		endpoint: 'fetch-epc',
		method: HttpMethod.GET
	})
	@AuthGuard()
	async fetchNextOutboundEpc(
		@Headers('X-User-Company') factory: string,
		@Query('_page', new DefaultValuePipe(1), ParseIntPipe) page: number
	) {
		return await this.rfidSharedService.getIncomingEpc(this.epcOutboundModel, factory, { _page: page, _limit: 50 })
	}

	@Api({
		endpoint: 'get-epc-by-size',
		method: HttpMethod.GET
	})
	@AuthGuard()
	async getOutboundEpcBySize(@Query(new ZodValidationPipe(findEpcBySizeValidator)) queries: FindEpcBySizeDTO) {
		return await this.rfidSharedService.findDeletableEpcs(this.epcOutboundModel, queries)
	}

	@Api({
		endpoint: 'post-data',
		method: HttpMethod.POST,
		statusCode: HttpStatus.CREATED,
		message: 'common.created'
	})
	async postOutboundData(@Body(new ZodValidationPipe(readerPostDataValidator)) payload: PostReaderDataDTO) {
		return await this.rfidOutboundService.postOutboundRFIDData(payload)
	}

	@Api({
		endpoint: 'update-stock',
		method: HttpMethod.PUT,
		statusCode: HttpStatus.CREATED,
		message: 'common.created'
	})
	async upsertStockOut(@Body(new ZodValidationPipe(upsertStockOutValidator)) payload: UpsertStockOutDTO) {
		return await this.rfidOutboundService.upsertStockOut(payload)
	}

	@Api({
		endpoint: 'delete-scanned-order/:commandNumber',
		method: HttpMethod.DELETE,
		statusCode: HttpStatus.OK,
		message: 'common.deleted'
	})
	@AuthGuard()
	async deleteScannedOutboundEpc(
		@Query('rescannable', new DefaultValuePipe(false), ParseBoolPipe) rescannable: boolean,
		@Param('commandNumber') commandNumber: string
	) {
		return await this.rfidSharedService.deleteScannedOrder(this.epcOutboundModel, commandNumber, rescannable)
	}

	@Api({
		endpoint: 'delete-scanned-epcs',
		method: HttpMethod.POST,
		statusCode: HttpStatus.OK,
		message: 'common.deleted'
	})
	@AuthGuard()
	async deleteBulkEpcs(
		@Query('rescannable', new DefaultValuePipe(false), ParseBoolPipe) rescannable: boolean,
		@Body(new ZodValidationPipe(deleteEpcValidator)) epcs: DeleteScannedEpcDTO
	) {
		return await this.rfidSharedService.deleteBulkEpcs(this.epcOutboundModel, epcs, rescannable)
	}

	@Api({
		endpoint: 'archived-epcs',
		method: HttpMethod.GET,
		statusCode: HttpStatus.OK
	})
	@AuthGuard()
	async getArchivedEpcs(
		@Headers('X-User-Company') factoryCode: string,
		@Query('_page', new DefaultValuePipe(1), ParseIntPipe) page: number,
		@Query('q', new DefaultValuePipe('')) search: string,
		@Query('mo_no.eq', new DefaultValuePipe('')) mo_no: string,
		@Query('shoes_style.eq', new DefaultValuePipe('')) shoes_style: string,
		@Query('color_sn.eq', new DefaultValuePipe('')) color_sn: string,
		@Query('size_numcode.eq', new DefaultValuePipe('')) size_numcode: string
	) {
		return await this.rfidOutboundService.getArchivedEpcs(factoryCode, {
			_page: page,
			_limit: 100,
			q: search,
			['shoes_style.eq']: shoes_style,
			['mo_no.eq']: mo_no,
			['color_sn.eq']: color_sn,
			['size_numcode.eq']: size_numcode
		})
	}

	@Api({
		endpoint: 'archived-epc-features',
		method: HttpMethod.GET,
		statusCode: HttpStatus.OK
	})
	@AuthGuard()
	async getArchivedEpcFeatures() {
		return await this.rfidOutboundService.getArchivedEpcFeatures()
	}

	@Api({
		endpoint: 'restore-archived-epcs',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED
	})
	@AuthGuard()
	async restoreArchivedEpcs(
		@Body(new ZodValidationPipe(restoreArchivedEpcValidator)) payload: RestoreArchivedEpcsDTO
	) {
		return await this.rfidOutboundService.restoreArchivedEpcs(payload)
	}
}
