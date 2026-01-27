import { HttpMethod, RequireAuthorized, RouteHandler } from '@/common/decorators'
import { Controller, DefaultValuePipe, HttpStatus, ParseIntPipe, Query } from '@nestjs/common'
import { UserRole } from '../user/constants'
import { StatisticService } from './statistic.service'

@Controller('statistics')
export class StatisticController {
	constructor(private readonly statisticService: StatisticService) {}

	@RouteHandler({
		endpoint: 'inventory-comparison',
		method: HttpMethod.GET,
		statusCode: HttpStatus.OK
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF, UserRole.DG_WAREHOUSE_STAFF)
	async getInventoryComparison() {
		return await this.statisticService.getInventoryComparison()
	}

	@RouteHandler({
		endpoint: 'annual-inoutbound-overview',
		method: HttpMethod.GET,
		statusCode: HttpStatus.OK
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF, UserRole.DG_WAREHOUSE_STAFF)
	async getAnnualInoutboundOverview(
		@Query('year.eq', new DefaultValuePipe(new Date().getFullYear()), ParseIntPipe) year: number
	) {
		return await this.statisticService.getAnnuallyInoutboundOverview(year)
	}

	@RouteHandler({
		endpoint: 'assembly-production-volumn',
		method: HttpMethod.GET,
		statusCode: HttpStatus.OK
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF, UserRole.DG_WAREHOUSE_STAFF)
	async getMonthlyInboundComparison() {
		return await this.statisticService.getAssemblyLineProductivity()
	}

	@RouteHandler({
		method: HttpMethod.GET,
		endpoint: 'defective-goods-inventory-composition',
		statusCode: HttpStatus.OK
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF, UserRole.DG_WAREHOUSE_STAFF)
	async getDefectiveGoodsInventoryComposition() {
		return await this.statisticService.getDefectiveGoodsInventoryComposition()
	}

	@RouteHandler({
		endpoint: 'net-flow',
		method: HttpMethod.GET,
		statusCode: HttpStatus.OK
	})
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF, UserRole.DG_WAREHOUSE_STAFF)
	async getLastSixMonthsNetFlow() {
		return await this.statisticService.getLastSixMonthsNetFlow()
	}
}
