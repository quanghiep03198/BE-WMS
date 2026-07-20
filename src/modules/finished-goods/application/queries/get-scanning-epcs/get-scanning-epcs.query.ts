import { StockFlow } from '@modules/finished-goods/domain/types'
import { IQuery } from '@nestjs/cqrs'

export class GetScanningEpcsQuery implements IQuery {
	constructor(
		public readonly stockFlow: StockFlow,
		public readonly pagination: {
			page: number
			limit: number
		},
		public readonly filterQuery: {
			mo_no?: string
			inbound_device_sn?: string
			outbound_device_sn?: string
			storage_location?: string
			inbound_at?: null
			outbound_at?: null
		}
	) {}
}
