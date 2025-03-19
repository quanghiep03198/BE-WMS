import { Api, AuthGuard, HttpMethod } from '@/common/decorators'
import { AllExceptionsFilter } from '@/common/filters'
import { Controller, DefaultValuePipe, Get, Query, Res, UseFilters } from '@nestjs/common'
import { format } from 'date-fns'
import { Response } from 'express'
import { ReportService } from './report.service'

@Controller('report')
export class ReportController {
	constructor(private readonly reportService: ReportService) {}

	@Api({ endpoint: 'daily-inbound', method: HttpMethod.GET })
	@AuthGuard()
	async getInboundReportByDate(
		@Query('date.eq', new DefaultValuePipe(format(new Date(), 'yyyy-MM-dd')))
		dateQuery: any
	) {
		return await this.reportService.getInboundReportByDate(dateQuery)
	}

	@Api({ endpoint: 'daily-outbound', method: HttpMethod.GET })
	@AuthGuard()
	async getOutboundReportByDate(
		@Query('date.eq', new DefaultValuePipe(format(new Date(), 'yyyy-MM-dd')))
		dateQuery: any
	) {
		return await this.reportService.getOutboundReportByDate(dateQuery)
	}

	@Api({ endpoint: 'monthly-inventory-report', method: HttpMethod.GET })
	@AuthGuard()
	async getMonthlyInventoryReport(
		@Query('month.eq', new DefaultValuePipe(format(new Date(), 'yyyy-MM'))) month: string
	) {
		return await this.reportService.getMonthlyInventoryReport(format(new Date(month), 'yyyyMM'))
	}

	@Get('export-daily-inbound')
	@UseFilters(AllExceptionsFilter)
	@AuthGuard()
	async exportDailyInboundToExcel(@Query('date.eq') date: string, @Res() res: Response) {
		// res.setHeader('Content-Disposition', 'attachment; filename=report.xlsx')
		// res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
		const buffer = await this.reportService.exportDailyInboundToExcel(date)
		return res.send(buffer)
	}

	@Get('export-daily-outbound')
	@UseFilters(AllExceptionsFilter)
	@AuthGuard()
	async exportDailyOutboundToExcel(@Query('date.eq') date: string, @Res() res: Response) {
		const buffer = await this.reportService.exportDailyOutboundToExcel(date)
		return res.send(buffer)
	}

	@Get('export-monthly-inventory-report')
	@UseFilters(AllExceptionsFilter)
	@AuthGuard()
	async exportMonthlyInventoryReport(
		@Query('month.eq', new DefaultValuePipe(format(new Date(), 'yyyy-MM'))) month: string,
		@Res() res: Response
	) {
		const buffer = await this.reportService.exportMonthlyInventoryToExcel(month)
		return res.send(buffer)
	}
}
