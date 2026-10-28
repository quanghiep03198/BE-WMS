import { Inject } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import {
	DEFECTIVE_GOODS_REPORT_REPOSITORY,
	type IDefectiveGoodsReportRepository
} from '../../ports/defective-goods-report.repository.port'
import { GetDailyInboundReportQuery } from './get-daily-inbound-report.query'

@QueryHandler(GetDailyInboundReportQuery)
export class GetDailyInboundReportHandler implements IQueryHandler<GetDailyInboundReportQuery> {
	constructor(
		@Inject(DEFECTIVE_GOODS_REPORT_REPOSITORY) private readonly repository: IDefectiveGoodsReportRepository
	) {}
	async execute({ date }: GetDailyInboundReportQuery) {
		return await this.repository.getDailyInboundReport(date)
	}
}
