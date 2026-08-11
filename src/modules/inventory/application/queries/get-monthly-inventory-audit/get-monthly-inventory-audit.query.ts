import { Query } from '@nestjs/cqrs'
import { IInventoryReportResponse } from '../../interfaces'

export class GetMonthlyInventoryAuditQuery extends Query<IInventoryReportResponse> {
	constructor(public readonly month: string) {
		super()
	}
}
