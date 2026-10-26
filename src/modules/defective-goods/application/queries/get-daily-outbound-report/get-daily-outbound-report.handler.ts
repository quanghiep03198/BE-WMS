import { DefectiveGoodsOutboundService } from '../../services/defective-outbound.service'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { GetDailyOutboundReportQuery } from './get-daily-outbound-report.query'

@QueryHandler(GetDailyOutboundReportQuery)
export class GetDailyOutboundReportHandler implements IQueryHandler<GetDailyOutboundReportQuery> {
	constructor(private readonly service: DefectiveGoodsOutboundService) {}
	async execute({ date }: GetDailyOutboundReportQuery) {
		return this.service.getDailyOutboundReport(date)
	}
}
