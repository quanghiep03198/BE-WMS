import { Api, HttpMethod } from '@/common/decorators/api.decorator'
import { AuthGuard } from '@/common/decorators/auth.decorator'
import { FileLogger } from '@/common/helpers/file-logger.helper'
import { TransformUppercasePipe } from '@/common/pipes/transform-uppercase.pipe'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'
import {
	BadRequestException,
	Body,
	Controller,
	DefaultValuePipe,
	Headers,
	HttpStatus,
	Logger,
	Param,
	ParseIntPipe,
	Query,
	Sse,
	UsePipes
} from '@nestjs/common'
import { catchError, from, interval, map, of, switchMap } from 'rxjs'
import { ProducingProcessSuffix } from '../constants'
import { UpdateStockDTO, updateStockValidator } from '../dto/pm-inventory.dto'
import { PMInventoryService } from '../services/pm-inventory.service'

@Controller('rfid/pm-inventory')
export class PMInventoryController {
	constructor(private readonly pmInventoryService: PMInventoryService) {}

	@Sse('sse')
	@AuthGuard()
	async fetchProducingEpc(
		@Headers('X-User-Company') factoryCode: string,
		@Query('process', TransformUppercasePipe) producingProcess: ProducingProcessSuffix
	) {
		if (!factoryCode) throw new BadRequestException('Factory code is required')
		if (!producingProcess) throw new BadRequestException('Producing process is required')
		Logger.debug(factoryCode)
		return interval(500).pipe(
			switchMap(() =>
				from(this.pmInventoryService.fetchLastestDataByProcess({ factoryCode, producingProcess, page: 1 })).pipe(
					catchError((error) => {
						return of({ error: error.message })
					})
				)
			),
			map((data) => ({ data }))
		)
	}

	@Api({ endpoint: 'fetch-epc', method: HttpMethod.GET })
	@AuthGuard()
	async fetchEpc(
		@Headers('X-User-Company') factoryCode: string,
		@Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
		@Query('process', TransformUppercasePipe) producingProcess: ProducingProcessSuffix
	) {
		return await this.pmInventoryService.fetchLastestDataByProcess({ factoryCode, producingProcess, page })
	}

	@Api({
		endpoint: 'update-stock',
		method: HttpMethod.PATCH
	})
	@AuthGuard()
	@UsePipes(new ZodValidationPipe(updateStockValidator))
	async updateStock(@Body() payload: UpdateStockDTO) {
		FileLogger.debug(payload)
		return await this.pmInventoryService.updateStock(payload)
	}

	@Api({
		endpoint: 'delete-unexpected-order/:order',
		method: HttpMethod.DELETE,
		statusCode: HttpStatus.NO_CONTENT,
		message: 'common.deleted'
	})
	async deleteUnexpectedOrder(@Param('order') orderCode: string) {
		return await this.pmInventoryService.deleteUnexpectedOrder(orderCode)
	}
}
