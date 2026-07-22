import { TManufacturingOrder } from '@modules/order/types'

export type StockFlow = 'inbound' | 'outbound'

export type ScannedOrderDetail = {
	mo_no
	color_sn
	factory_shoes_style
	sizes: Array<{ size_numcode: string; count: number }>
}

export type UpsertEpcsMatchData = Array<
	Omit<TManufacturingOrder, 'sizes'> & {
		epc: string
		size_qty: number
		remark: string
	}
>
