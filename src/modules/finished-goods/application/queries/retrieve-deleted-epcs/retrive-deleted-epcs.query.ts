import { StockFlow } from '@modules/finished-goods/domain/types'
import { Query } from '@nestjs/cqrs'

export class RetriveDeletedEpcsQuery extends Query<any> {
	// Array<{ epc: string; mo_no: string; factory_shoes_style: string; color_sn: string; size_numcode: string }>
	constructor(
		public readonly stockFlow: StockFlow,
		public readonly pagination: {
			page: number
			limit: number
		},
		public readonly filterQuery: Partial<{
			epc: string
			mo_no: string
			factory_shoes_style: string
			color_sn: string
			size_numcode: string
			scannable: boolean
			inbound_at: never
			outbound_at: never
			outbound_device_sn: 'dectectable' | 'undetectable'
		}>
	) {
		super()
	}
}
