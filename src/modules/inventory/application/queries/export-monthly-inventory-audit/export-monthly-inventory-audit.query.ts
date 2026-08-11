import { Query } from '@nestjs/cqrs'

export class ExportMonthlyInventoryAuditQuery extends Query<ArrayBufferLike> {
	constructor(
		public readonly month: string,
		public readonly factory: string,
		public readonly manufacturingOrders?: Array<string>
	) {
		super()
	}
}
