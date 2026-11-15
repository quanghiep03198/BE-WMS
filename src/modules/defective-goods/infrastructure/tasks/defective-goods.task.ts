import {
	DEFECTIVE_GOODS_REPORT_REPOSITORY,
	IDefectiveGoodsReportRepository
} from '@modules/defective-goods/application/ports/defective-goods-report.repository.port'
import { Inject, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Cron, CronExpression } from '@nestjs/schedule'
import { format } from 'date-fns'
import {
	DefectiveGoodsDailyReport,
	DefectiveGoodsDailyReportModel
} from '../persistence/mongodb/schemas/defective-goods-daily-report.schema'

@Injectable()
export class DefectiveGoodsTask {
	constructor(
		@Inject(DEFECTIVE_GOODS_REPORT_REPOSITORY)
		private readonly defectiveGoodsReportRepository: IDefectiveGoodsReportRepository,
		@InjectModel(DefectiveGoodsDailyReport.name)
		private readonly defectiveGoodsDailyReportModel: DefectiveGoodsDailyReportModel
	) {}

	@Cron(CronExpression.EVERY_5_SECONDS)
	async generateDailyInboundReport() {
		const report = await this.defectiveGoodsReportRepository.getDailyInboundReport(new Date())
		if (report.length === 0) return

		await this.defectiveGoodsDailyReportModel.insertMany(
			report.map((item) => ({
				date: format(new Date(), 'yyyy-MM-dd'),
				type: 'inbound',
				...item
			}))
		)
	}

	@Cron(CronExpression.EVERY_5_SECONDS)
	async generateDailyOutboundReport() {
		const report = await this.defectiveGoodsReportRepository.getDailyOutboundReport(new Date())
		if (report.length === 0) return

		await this.defectiveGoodsDailyReportModel.insertMany(
			report.map((item) => ({
				date: format(new Date(), 'yyyy-MM-dd'),
				type: 'outbound',
				...item
			}))
		)
	}
}
