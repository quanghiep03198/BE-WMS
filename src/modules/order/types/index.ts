export type SizeRun = {
	size_numcode: string
	size_qty: number
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
	sizes: Array<SizeRun>
}
