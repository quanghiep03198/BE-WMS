import { Inject } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import {
	DEFECTIVE_GOODS_REPORT_REPOSITORY,
	type IDefectiveGoodsReportRepository
} from '../../ports/defective-goods-report.repository.port'
import { GetDailyOutboundReportQuery } from './get-daily-outbound-report.query'

@QueryHandler(GetDailyOutboundReportQuery)
export class GetDailyOutboundReportHandler implements IQueryHandler<GetDailyOutboundReportQuery> {
	constructor(
		@Inject(DEFECTIVE_GOODS_REPORT_REPOSITORY) private readonly repository: IDefectiveGoodsReportRepository
	) {}

	async execute({ date }: GetDailyOutboundReportQuery) {
		return await this.repository.getDailyOutboundReport(date)
	}
}
