import { Api, AuthGuard, HttpMethod } from '@/common/decorators'
import { AllExceptionsFilter } from '@/common/filters'
import { Controller, DefaultValuePipe, Get, Headers, Query, Res, UseFilters } from '@nestjs/common'
import { format } from 'date-fns'
import { Response } from 'express'
import { ReportService } from './report.service'

@Controller('report')
export class ReportController {
	constructor(private readonly reportService: ReportService) {}

	@Api({ endpoint: 'daily-inbound', method: HttpMethod.GET })
	@AuthGuard()
	async getInboundReportByDate(
		@Headers('X-User-Company') factoryCode: string,
		@Query('date.eq', new DefaultValuePipe(format(new Date(), 'yyyy-MM-dd')))
		dateQuery: any
	) {
		return await this.reportService.getInboundReportByDate(factoryCode, dateQuery)
	}

	@Api({ endpoint: 'daily-outbound', method: HttpMethod.GET })
	@AuthGuard()
	async getOutboundReportByDate(
		@Headers('X-User-Company') factoryCode: string,
		@Query('date.eq', new DefaultValuePipe(format(new Date(), 'yyyy-MM-dd')))
		dateQuery: any
	) {
		return await this.reportService.getOutboundReportByDate(factoryCode, dateQuery)
	}

	@Get('export')
	@UseFilters(AllExceptionsFilter)
	@AuthGuard()
	async exportReportToExcel(
		@Headers('X-User-Company') factoryCode: string,
		@Query('date.eq') date: string,
		@Res() res: Response
	) {
		const buffer = await this.reportService.exportReportToExcel(factoryCode, date)

		return res.send(buffer)
		// res.setHeader('Content-Disposition', 'attachment; filename=report.xlsx')
		// res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
	}
}
