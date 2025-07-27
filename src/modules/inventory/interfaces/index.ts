import { InventoryType } from '../constants'

export interface IInventoryReportQueryResult {
	brand_name: string
	po: string
	mo_no: string
	order_qty: number
	or_no: string
	inv_type: InventoryType
	factory_shoes_style: string | null
	init_inv_qty: number
	total_instock_qty: number
	total_outstock_qty: number
	actual_inv_qty: number
	final_inv_qty: number
	detail: string
}

export type IInventoryReportResponse = Array<
	Omit<IInventoryReportQueryResult, 'size_data'> & {
		detail: Array<{
			size: string
			order_qty_by_size: number
			initial_stock_qty: number
			instock_qty: number
			outstock_qty: number
			actual_instock_qty: number
			actual_outstock_qty: number
			final_stock_qty: number
		}>
	}
>
