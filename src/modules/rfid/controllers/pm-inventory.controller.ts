import { Api, HttpMethod } from '@/common/decorators/api.decorator'
import { AuthGuard } from '@/common/decorators/auth.decorator'
import { TransformUppercasePipe } from '@/common/pipes/transform-uppercase.pipe'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'
import {
	BadRequestException,
	Controller,
	DefaultValuePipe,
	Headers,
	HttpStatus,
	Param,
	ParseIntPipe,
	Query,
	Sse
} from '@nestjs/common'
import { catchError, from, interval, map, of, switchMap } from 'rxjs'
import { ProducingProcessSuffix } from '../constants'
import { DeleteOrderDTO, deleteOrderValidator, processValidator, UpdatePMStockDTO } from '../dto/pm-inventory.dto'
import { PMInventoryService } from '../services/pm-inventory.service'

@Controller('rfid/pm-inventory')
export class PMInventoryController {
	constructor(private readonly pmInventoryService: PMInventoryService) {}

	@Sse('sse')
	@AuthGuard()
	async fetchProducingEpc(
		@Headers('X-User-Company') factoryCode: string,
		@Headers('X-Polling-Duration') pollingDuration: number,
		@Query('process', new ZodValidationPipe(processValidator))
		producingProcess: ProducingProcessSuffix
	) {
		const FALLBACK_POLLING_DURATION: number = 500
		const duration = pollingDuration ?? FALLBACK_POLLING_DURATION
		if (!factoryCode) throw new BadRequestException('Factory code is required')

		return interval(duration).pipe(
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
		@Query('process', TransformUppercasePipe) producingProcess: ProducingProcessSuffix,
		@Query('selected_order') selectedOrder: string
	) {
		return await this.pmInventoryService.fetchLastestDataByProcess({
			factoryCode,
			producingProcess,
			page,
			selectedOrder
		})
	}

	@Api({
		endpoint: 'update-stock/:process/:order',
		method: HttpMethod.PATCH
	})
	@AuthGuard()
	async updateStock(
		@Headers('X-User-Company') factoryCode: string,
		@Param('order') order: string,
		@Param('process') producingPrcess: ProducingProcessSuffix
	) {
		return await this.pmInventoryService.updateStock({
			factoryCode,
			order,
			producingPrcess
		} satisfies UpdatePMStockDTO)
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
		return await this.pmInventoryService.deleteUnexpectedOrder({ factoryCode, ...deleteOrderQueries })
	}
}
