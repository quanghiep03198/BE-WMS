import { Api, AuthGuard, HttpMethod } from '@/common/decorators'
import { Controller, DefaultValuePipe, HttpStatus, ParseIntPipe, Query } from '@nestjs/common'
import { StatisticService } from './statistic.service'

@Controller('statistics')
export class StatisticController {
	constructor(private readonly statisticService: StatisticService) {}

	@Api({
		endpoint: 'inventory-comparison',
		method: HttpMethod.GET,
		statusCode: HttpStatus.OK
	})
	@AuthGuard()
	async getInventoryComparison() {
		return await this.statisticService.getInventoryComparison()
	}

	@Api({
		endpoint: 'annual-inoutbound-overview',
		method: HttpMethod.GET,
		statusCode: HttpStatus.OK
	})
	@AuthGuard()
	async getAnnualInoutboundOverview(
		@Query('year.eq', new DefaultValuePipe(new Date().getFullYear()), ParseIntPipe) year: number
	) {
		return await this.statisticService.getAnnuallyInoutboundOverview(year)
	}

	@Api({
		endpoint: 'assembly-production-volumn',
		method: HttpMethod.GET,
		statusCode: HttpStatus.OK
	})
	@AuthGuard()
	async getMonthlyInboundComparison() {
		return await this.statisticService.getAssemblyLineProductivity()
	}

	@Api({
		endpoint: 'net-flow',
		method: HttpMethod.GET,
		statusCode: HttpStatus.OK
	})
	@AuthGuard()
	async getLastSixMonthsNetFlow() {
		return await this.statisticService.getLastSixMonthsNetFlow()
	}
}
