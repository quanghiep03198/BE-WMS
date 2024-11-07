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
	ParseIntPipe,
	Query,
	Sse,
	UsePipes
} from '@nestjs/common'
import { catchError, from, interval, map, of, switchMap } from 'rxjs'
import { ProducingProcessSuffix } from '../constants'
import {
	DeleteOrderDTO,
	deleteOrderValidator,
	processValidator,
	UpdateStockDTO,
	updateStockValidator
} from '../dto/pm-inventory.dto'
import { PMInventoryService } from '../services/pm-inventory.service'

@Controller('rfid/pm-inventory')
export class PMInventoryController {
	constructor(private readonly pmInventoryService: PMInventoryService) {}

	@Sse('sse')
	@AuthGuard()
	async fetchProducingEpc(
		@Headers('X-User-Company') factoryCode: string,
		@Query('process', new ZodValidationPipe(processValidator))
		producingProcess: ProducingProcessSuffix
	) {
		if (!factoryCode) throw new BadRequestException('Factory code is required')

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
		endpoint: 'delete-unexpected-order',
		method: HttpMethod.DELETE,
		statusCode: HttpStatus.OK,
		message: 'common.deleted'
	})
	async deleteUnexpectedOrder(
		@Headers('X-User-Company') factoryCode: string,
		@Query(new ZodValidationPipe(deleteOrderValidator)) deleteOrderQueries: DeleteOrderDTO
	) {
		console.log(deleteOrderQueries)
		const result = await this.pmInventoryService.deleteUnexpectedOrder({ factoryCode, ...deleteOrderQueries })
		Logger.debug(result)
		return result
	}
}
