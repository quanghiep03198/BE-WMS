export type StockFlow = 'inbound' | 'outbound'

export type ScannedOrderDetail = {
	mo_no
	color_sn
	factory_shoes_style
	sizes: Array<{ size_numcode: string; count: number }>
}

export type TManufacturingOrder = {
	mo_no: string
	brand_name: string
	mat_code: string
	mo_noseq: string
	or_no: string
	or_cust_po: string
	factory_shoes_style: string
	cust_shoes_style: string
	color_sn: string
	size_numcode: string
	size_code: string
	size_sumqty: number
	factory_code_produce: string
	sizes: Array<{ size_numcode: string; size_qty: number }>
}

export type UpsertEpcsMatchData = Array<
	Omit<TManufacturingOrder, 'sizes'> & {
		epc: string
		size_qty: number
		// factory_code_orders: string
		// factory_name_orders: string
		// factory_code_produce: string
		// factory_name_produce: string
		remark: string
	}
>
