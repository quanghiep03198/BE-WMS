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
import { catchError, from, interval, map, of, Subject, switchMap, takeUntil } from 'rxjs'
import { ProducingProcessSuffix } from '../constants'
import {
	DeleteOrderQueriesDTO,
	deleteOrderQueriesValidator,
	processValidator,
	UpdatePMStockParamsDTO
} from '../dto/pm-inventory.dto'
import { FetchLatestPMDataArgs } from '../rfid.interface'
import { PMInventoryService } from '../services/pm-inventory.service'

@Controller('rfid/pm-inventory')
export class PMInventoryController {
	constructor(private readonly pmInventoryService: PMInventoryService) {}

	@Sse('sse')
	@AuthGuard()
	async fetchProducingEpc(
		@Headers('X-User-Company') factoryCode: string,
		@Headers('X-Polling-Duration') pollingDuration: number,
		@Query('producing_process.eq', new ZodValidationPipe(processValidator))
		producingProcess: ProducingProcessSuffix
	) {
		const FALLBACK_POLLING_DURATION: number = 1000
		const duration = pollingDuration ?? FALLBACK_POLLING_DURATION
		if (!factoryCode) throw new BadRequestException('Factory code is required')

		const errorSubject = new Subject<void>()

		return interval(duration).pipe(
			switchMap(() =>
				from(
					this.pmInventoryService.fetchLastestDataByProcess({
						'factory_code.eq': factoryCode,
						'producing_process.eq': producingProcess,
						page: 1
					})
				).pipe(
					catchError((error) => {
						errorSubject.next()
						return of({ error: error.message })
					})
				)
			),
			map((data) => ({ data })),
			takeUntil(errorSubject)
		)
	}

	@Api({ endpoint: 'fetch-epc', method: HttpMethod.GET })
	@AuthGuard()
	async fetchEpc(
		@Headers('X-User-Company') factoryCode: string,
		@Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
		@Query('producing_process.eq', TransformUppercasePipe) producingProcess: ProducingProcessSuffix,
		@Query('mo_no.eq') selectedOrder: string
	) {
		return await this.pmInventoryService.fetchLastestDataByProcess({
			page,
			'factory_code.eq': factoryCode,
			'producing_process.eq': producingProcess,
			'mo_no.eq': selectedOrder
		} satisfies FetchLatestPMDataArgs)
	}

	@Api({
		endpoint: 'update-stock/:process_code/:order_code',
		method: HttpMethod.PATCH
	})
	@AuthGuard()
	async updateStock(
		@Headers('X-User-Company') factoryCode: string,
		@Param('order_code') orderCode: string,
		@Param('process_code') processCode: ProducingProcessSuffix
	) {
		return await this.pmInventoryService.updateStock({
			'factory_code.eq': factoryCode,
			'mo_no.eq': orderCode,
			'producing_process.eq': processCode
		} satisfies UpdatePMStockParamsDTO)
	}

	@Api({
		endpoint: 'delete-unexpected-order',
		method: HttpMethod.DELETE,
		statusCode: HttpStatus.OK,
		message: 'common.deleted'
	})
	async deleteUnexpectedOrder(
		@Headers('X-User-Company') factoryCode: string,
		@Query(new ZodValidationPipe(deleteOrderQueriesValidator))
		deleteOrderQueries: Omit<DeleteOrderQueriesDTO, 'factory_code.eq'>
	) {
		return await this.pmInventoryService.softDeleteUnexpectedOrder({
			'factory_code.eq': factoryCode,
			...deleteOrderQueries
		} satisfies DeleteOrderQueriesDTO)
	}
}
