export type IInventoryReportResponse = Array<{
	mo_no: string
	order_qty: number
	storage_locations: Array<string>
	brand_name: string
	factory_shoes_style: string
	cust_shoes_style: string
	color_sn: string
	inventory_closure_status: 'completed' | 'pending'
	beginning_inventory_qty: number
	total_stocked_in_qty: number
	total_shipped_out_qty: number
	total_supplemental_qty: number
	final_inventory_qty: number
	size_ledger: Array<{
		size_numcode: string
		order_qty: number
		beginning_inventory_qty: number
		stocked_in_qty: number
		shipped_out_qty: number
		supplemental_stocked_in_qty: number
		supplemental_shipped_out_qty: number
		final_inventory_qty: number
	}>
}>
