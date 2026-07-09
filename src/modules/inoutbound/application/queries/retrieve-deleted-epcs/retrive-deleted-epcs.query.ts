import { StockFlow } from '@/modules/inoutbound/domain/types'
import { Query } from '@nestjs/cqrs'

export class RetriveDeletedEpcsQuery extends Query<any> {
	// Array<{ epc: string; mo_no: string; factory_shoes_style: string; color_sn: string; size_numcode: string }>
	constructor(
		public readonly flow: StockFlow,
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
			outbound_device_sn: 'none' | 'any'
		}>
	) {
		super()
	}
}
