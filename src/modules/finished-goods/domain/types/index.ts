export type StockFlow = 'inbound' | 'outbound'

export type ScannedOrderDetail = {
	mo_no
	color_sn
	factory_shoes_style
	sizes: Array<{ size_numcode: string; count: number }>
}
