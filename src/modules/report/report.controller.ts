import { CommonRequestHeader } from '@/common/constants'
import { Api, AuthGuard, HttpMethod } from '@/common/decorators'
import { AllExceptionsFilter } from '@/common/filters'
import { Controller, DefaultValuePipe, Get, Headers, Query, Res, UseFilters } from '@nestjs/common'
import { format } from 'date-fns'
import { Response } from 'express'
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

	@Api({ endpoint: 'daily-inbound', method: HttpMethod.GET })
	@AuthGuard()
	async getInboundReportByDate(
		@Query('date.eq', new DefaultValuePipe(format(new Date(), 'yyyy-MM-dd')))
		dateQuery: any
	) {
		return await this.inboundReportService.getInboundReportByDate(dateQuery)
	}

	@Get('daily-inbound/export')
	@UseFilters(AllExceptionsFilter)
	@AuthGuard()
	async exportDailyInboundToExcel(@Query('date.eq') date: string, @Res() res: Response) {
		// res.setHeader('Content-Disposition', 'attachment; filename=report.xlsx')
		// res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
		const buffer = await this.inboundReportService.exportDailyInboundToExcel(date)
		return res.send(buffer)
	}

	// #endregion

	// #region Outbound report

	@Api({ endpoint: 'daily-outbound', method: HttpMethod.GET })
	@AuthGuard()
	async getOutboundReportByDate(
		@Query('date.eq', new DefaultValuePipe(format(new Date(), 'yyyy-MM-dd')))
		dateQuery: any
	) {
		return await this.outboundReportService.getOutboundReportByDate(dateQuery)
	}

	@Get('daily-outbound/export')
	@UseFilters(AllExceptionsFilter)
	@AuthGuard()
	async exportDailyOutboundToExcel(
		@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@Query('date.eq') date: string,
		@Res() res: Response
	) {
		const buffer = await this.outboundReportService.exportDailyOutboundToExcel(factoryCode, date)
		return res.send(buffer)
	}

	// #endregion

	// #region Packing weight report

	@Api({ endpoint: 'daily-weighing', method: HttpMethod.GET })
	@AuthGuard()
	async getDailyPackingReport(
		@Query('date.eq', new DefaultValuePipe(format(new Date(), 'yyyy-MM-dd'))) date: string,
		@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string
	) {
		return await this.packingWeightReportService.getDailyPackingReport(date, factoryCode)
	}

	@Get('daily-weighing/export')
	@UseFilters(AllExceptionsFilter)
	@AuthGuard()
	async exportPackingWeightReport(
		@Query('date.eq', new DefaultValuePipe(format(new Date(), 'yyyy-MM-dd'))) date: string,
		@Headers(CommonRequestHeader.FACTORY_CODE) factoryCode: string,
		@Res() res: Response
	) {
		const buffer = await this.packingWeightReportService.exportDailyPackingToExcel(date, factoryCode)
		return res.send(buffer)
	}
}
