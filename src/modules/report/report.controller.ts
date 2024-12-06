import { Api, HttpMethod } from '@/common/decorators/api.decorator'
import { AuthGuard } from '@/common/decorators/auth.decorator'
import { AllExceptionsFilter } from '@/common/filters/exceptions.filter'
import { Controller, Get, Headers, Query, Res, UseFilters } from '@nestjs/common'
import { format } from 'date-fns'
import { Response } from 'express'
import { IReportSearchParams } from './interfaces'
import { ReportService } from './report.service'

@Controller('report')
export class ReportController {
	constructor(private readonly reportService: ReportService) {}

	@Api({ method: HttpMethod.GET })
	@AuthGuard()
	findAll(
		@Headers('X-User-Company') factoryCode: string,
		@Query()
		dateQuery: any
	) {
		return this.reportService.findByDate({
			'factory_code.eq': factoryCode,
			'date.eq': dateQuery['date.eq'] ?? format(new Date(), 'yyyy-MM-dd')
		} satisfies IReportSearchParams)
	}

	@Get('/export')
	@UseFilters(AllExceptionsFilter)
	// @AuthGuard()
	async exportReportToExcel(
		@Headers('X-User-Company') factoryCode: string,
		@Query('date.eq') date: string,
		@Res() res: Response
	) {
		const buffer = await this.reportService.exportReportToExcel({
			'date.eq': date,
			'factory_code.eq': factoryCode
		})

		// res.setHeader('Content-Disposition', 'attachment; filename=report.xlsx')
		// res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
		res.send(buffer)
	}
}
