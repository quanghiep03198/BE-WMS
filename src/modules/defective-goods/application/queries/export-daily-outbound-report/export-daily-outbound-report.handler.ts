import { DefectiveGoodsOutboundService } from '../../services/defective-outbound.service'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { ExportDailyOutboundReportQuery } from './export-daily-outbound-report.query'

@QueryHandler(ExportDailyOutboundReportQuery)
export class ExportDailyOutboundReportHandler implements IQueryHandler<ExportDailyOutboundReportQuery, Buffer> {
	constructor(private readonly service: DefectiveGoodsOutboundService) {}
	async execute({ date, factoryCode }: ExportDailyOutboundReportQuery) {
		return this.service.exportDailyOutboundToExcel(date, factoryCode)
	}
}
