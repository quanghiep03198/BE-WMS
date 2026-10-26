import { DefectiveGoodsInboundService } from '../../services/defective-inbound.service'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { GetDailyInboundReportQuery } from './get-daily-inbound-report.query'

@QueryHandler(GetDailyInboundReportQuery)
export class GetDailyInboundReportHandler implements IQueryHandler<GetDailyInboundReportQuery> {
	constructor(private readonly service: DefectiveGoodsInboundService) {}
	async execute({ date }: GetDailyInboundReportQuery) {
		return this.service.getDailyInboundReport(date)
	}
}
