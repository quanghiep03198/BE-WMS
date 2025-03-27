import { FACTORY_CODE_REF } from '@/common/constants/factory'
import { Api, AuthGuard, HttpMethod } from '@/common/decorators'
import { AllExceptionsFilter } from '@/common/filters'
import { Controller, DefaultValuePipe, Get, Headers, Logger, Query, Res, UseFilters } from '@nestjs/common'
import { format } from 'date-fns'
import { Response } from 'express'
import { InboundReportService } from './services/inbound-report.service'
import { InventoryReportService } from './services/inventory-report.service'
import { OutboundReportService } from './services/outbound-report.service'
import { PackingWeightReportService } from './services/packing-weight-report.service'

@Controller('report')
export class ReportController {
	constructor(
		private readonly inboundReportService: InboundReportService,
		private readonly outboundReportService: OutboundReportService,
		private readonly inventoryReportService: InventoryReportService,
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

	@Get('export-daily-inbound')
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

	@Get('export-daily-outbound')
	@UseFilters(AllExceptionsFilter)
	@AuthGuard()
	async exportDailyOutboundToExcel(@Query('date.eq') date: string, @Res() res: Response) {
		const buffer = await this.outboundReportService.exportDailyOutboundToExcel(date)
		return res.send(buffer)
	}

	// #endregion

	// #region Inventory report

	@Api({ endpoint: 'monthly-inventory-report', method: HttpMethod.GET })
	@AuthGuard()
	async getMonthlyInventoryReport(
		@Query('month.eq', new DefaultValuePipe(format(new Date(), 'yyyy-MM'))) month: string
	) {
		return await this.inventoryReportService.getMonthlyInventoryReport(format(new Date(month), 'yyyyMM'))
	}

	@Get('export-monthly-inventory-report')
	@UseFilters(AllExceptionsFilter)
	@AuthGuard()
	async exportMonthlyInventoryReport(
		@Query('month.eq', new DefaultValuePipe(format(new Date(), 'yyyy-MM'))) month: string,
		@Res() res: Response
	) {
		const buffer = await this.inventoryReportService.exportMonthlyInventoryToExcel(month)
		return res.send(buffer)
	}

	// #endregion

	// #region Packing weight report

	@Api({ endpoint: 'daily-packing-report', method: HttpMethod.GET })
	@AuthGuard()
	async getDailyPackingReport(
		@Query('date.eq', new DefaultValuePipe(format(new Date(), 'yyyy-MM-dd'))) date: string,
		@Headers('X-User-Company') factoryCode: string
	) {
		Logger.debug(FACTORY_CODE_REF[factoryCode])
		return await this.packingWeightReportService.getDailyPackingReport(date, factoryCode)
	}

	@Get('export-daily-packing-report')
	@UseFilters(AllExceptionsFilter)
	@AuthGuard()
	async exportPackingWeightReport(
		@Query('date.eq', new DefaultValuePipe(format(new Date(), 'yyyy-MM-dd'))) date: string,
		@Headers('X-User-Company') factoryCode: string,
		@Res() res: Response
	) {
		const buffer = await this.packingWeightReportService.exportDailyPackingToExcel(date, factoryCode)
		return res.send(buffer)
	}
}
