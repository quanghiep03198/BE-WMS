import { Inject } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import {
	DEFECTIVE_GOODS_REPORT_REPOSITORY,
	IDefectiveGoodsReportRepository
} from '../../ports/defective-goods-report.repository.port'
import { GetDefectiveGoodsInventoryQuery } from './get-defective-goods-inventory.query'

@QueryHandler(GetDefectiveGoodsInventoryQuery)
export class GetDefectiveGoodsInventoryHandler implements IQueryHandler<GetDefectiveGoodsInventoryQuery> {
	constructor(
		@Inject(DEFECTIVE_GOODS_REPORT_REPOSITORY)
		private readonly repository: IDefectiveGoodsReportRepository
	) {}
	async execute() {
		return this.repository.getInventoryReport()
	}
}
