import { StockFlow } from '@/modules/inoutbound/domain/types'
import { IQuery } from '@nestjs/cqrs'

export class GetScanningEpcsQuery implements IQuery {
	constructor(
		public readonly flow: StockFlow,
		public readonly pagination: {
			page: number
			limit: number
		},
		public readonly filterQuery: {
			mo_no?: string
			inbound_device_sn?: string
			inbound_at?: null
			outbound_at?: null
		}
	) {}
}
