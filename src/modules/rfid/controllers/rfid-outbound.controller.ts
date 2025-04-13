import { Api, AuthGuard, HttpMethod } from '@/common/decorators'
import { AllExceptionsFilter } from '@/common/filters'
import { ZodValidationPipe } from '@/common/pipes'
import {
	Body,
	Controller,
	DefaultValuePipe,
	Get,
	HttpStatus,
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
	PostReaderDataDTO,
	readerPostDataValidator,
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
	async streamOutboundRFIDData(@Res() res: Response) {
		res.setHeader('Content-Type', 'text/event-stream')
		res.setHeader('Cache-Control', 'no-cache')
		const handleChange = async () => {
			const data = await this.rfidOutboundService.fetchLatestOutboundData({ _page: 1, _limit: 50 })
			if (data) {
				res.write(`data: ${JSON.stringify(data)}\n\n`)
				res.flush()
			}
		}
		await handleChange()
		const changeStream = this.rfidSharedService.captureDataChange(this.epcOutboundModel, handleChange)
		res.on('close', () => {
			changeStream.removeListener('change', handleChange)
			changeStream.close()
			res.end()
		})
	}

	@Api({
		endpoint: 'fetch-epc',
		method: HttpMethod.GET
	})
	@AuthGuard()
	async fetchNextOutboundEpc(@Query('_page', new DefaultValuePipe(1), ParseIntPipe) page: number) {
		return await this.rfidOutboundService.getIncomingOutboundEpcs({ _page: page, _limit: 50 })
	}

	@Api({
		endpoint: 'post-data',
		method: HttpMethod.POST,
		statusCode: HttpStatus.CREATED,
		message: 'common.created'
	})
	async postOutboundData(@Body(new ZodValidationPipe(readerPostDataValidator)) payload: PostReaderDataDTO) {
		return await this.rfidOutboundService.addOutboundRFIDDataJob(payload)
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
		endpoint: 'delete-scanned-epcs',
		method: HttpMethod.DELETE,
		statusCode: HttpStatus.NO_CONTENT,
		message: 'common.created'
	})
	@AuthGuard()
	async deleteScannedOutboundEpc(@Query(new ZodValidationPipe(deleteEpcValidator)) filters: DeleteScannedEpcDTO) {
		return await this.rfidOutboundService.deleteScannedOutboundEpcs(filters)
	}
}
