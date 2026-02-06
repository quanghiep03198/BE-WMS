import { CommonRequestHeader } from '@/common/constants'
import { HttpMethod, RequireAuthorized, RouteHandler } from '@/common/decorators'
import { AllExceptionsFilter } from '@/common/filters'
import {
	BadRequestException,
	Controller,
	DefaultValuePipe,
	Get,
	Headers,
	Param,
	Query,
	Res,
	UseFilters
} from '@nestjs/common'
import { format } from 'date-fns'
import { FastifyReply } from 'fastify'
import { FactoryCode } from '../department/constants'
import { UserRole } from '../user/constants'
import { InboundReportService } from './services/inbound-report.service'
import { OutboundReportService } from './services/outbound-report.service'
import { PackingWeightReportService } from './services/packing-weight-report.service'

@Controller('report')
export class ReportController {
	constructor(
		private readonly inboundReportService: InboundReportService,
		private readonly outboundReportService: OutboundReportService,
		private readonly packingWeightReportService: PackingWeightReportService
	) {}

	// #region Inbound report

	@RouteHandler({ endpoint: 'daily-inbound', method: HttpMethod.GET })
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async getInboundReportByDate(
		@Query('date.eq', new DefaultValuePipe(format(new Date(), 'yyyy-MM-dd')))
		dateQuery: any
	) {
		return await this.inboundReportService.getDailyProductivity(dateQuery)
	}

	@RouteHandler({ endpoint: 'inbound-history/:commandNumber', method: HttpMethod.GET })
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async getInboundHistory(@Param('commandNumber') commandNumber: string) {
		return await this.inboundReportService.getInboundHistory(commandNumber)
	}

	@Get('daily-inbound/export/:reportType')
	@UseFilters(AllExceptionsFilter)
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async exportDailyInboundToExcel(
		@Param('reportType') reportType: 'daily-productivity' | 'shaping-department-productivity',
		@Query('date.eq') date: string,
		@Res() reply: FastifyReply
	) {
		// reply.setHeader('Content-Disposition', 'attachment; filename=report.xlsx')
		// reply.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
		if (reportType !== 'daily-productivity' && reportType !== 'shaping-department-productivity')
			throw new BadRequestException(
				'Invalid report type. Must be "daily-productivity" or "shaping-department-productivity".'
			)
		const buffer = await this.inboundReportService.exportDailyInboundToExcel(reportType, date)
		return reply.send(buffer)
	}

	// #endregion

	// #region Outbound report

	@RouteHandler({ endpoint: 'daily-outbound', method: HttpMethod.GET })
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async getOutboundReportByDate(
		@Query('date.eq', new DefaultValuePipe(format(new Date(), 'yyyy-MM-dd')))
		dateQuery: any
	) {
		return await this.outboundReportService.getOutboundReportByDate(dateQuery)
	}

	@RouteHandler({ endpoint: 'outbound-history/:po', method: HttpMethod.GET })
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async getOutboundHistory(
		@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: FactoryCode,
		@Param('po') po: string
	) {
		return await this.outboundReportService.getOutboundHistory(factoryCode, po)
	}

	@Get('daily-outbound/export')
	@UseFilters(AllExceptionsFilter)
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async exportDailyOutboundToExcel(
		@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@Query('date.eq') date: string,
		@Res() reply: FastifyReply
	) {
		const buffer = await this.outboundReportService.exportDailyOutboundToExcel(factoryCode, date)
		return reply.send(buffer)
	}

	// #endregion

	// #region Packing weight report

	@RouteHandler({ endpoint: 'daily-weighing', method: HttpMethod.GET })
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async getDailyPackingReport(
		@Query('date.eq', new DefaultValuePipe(format(new Date(), 'yyyy-MM-dd'))) date: string,
		@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string
	) {
		return await this.packingWeightReportService.getDailyPackingReport(date, factoryCode)
	}

	@Get('daily-weighing/export')
	@UseFilters(AllExceptionsFilter)
	@RequireAuthorized(UserRole.MANAGER, UserRole.FG_WAREHOUSE_STAFF)
	async exportPackingWeightReport(
		@Query('date.eq', new DefaultValuePipe(format(new Date(), 'yyyy-MM-dd'))) date: string,
		@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@Res() reply: FastifyReply
	) {
		const buffer = await this.packingWeightReportService.exportDailyPackingToExcel(date, factoryCode)
		return reply.send(buffer)
	}
}
