import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { DefectiveGoodsInboundService } from '../../services/defective-inbound.service'
import { ExportDailyInboundReportQuery } from './export-daily-inbound-report.query'

@QueryHandler(ExportDailyInboundReportQuery)
export class ExportDailyInboundReportHandler implements IQueryHandler<ExportDailyInboundReportQuery, Buffer> {
	constructor(private readonly service: DefectiveGoodsInboundService) {}
	async execute({ date, factoryCode }: ExportDailyInboundReportQuery) {
		return this.service.exportDailyInboundToExcel(date, factoryCode)
	}
}
