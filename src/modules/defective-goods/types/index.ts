export type DefectiveGoodsInventory = {
	brand_name: string
	po: string
	mo_no: string
	factory_shoes_style: string
	cust_shoes_style: string
	storage_location: string[]
	color_sn: string
	size_data: Array<{ size_numcode: string; qty: number }>
}
