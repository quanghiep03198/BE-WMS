import { RequestUser } from '@common/decorators'
import { InventoryType } from '../constants'

export interface IInventoryReportQueryResult {
	brand_name: string
	po: string
	mo_no: string
	order_qty: number
	or_no: string
	inv_type: InventoryType
	factory_shoes_style: string | null
	total_storage_capacity: number
	total_number_of_storage: number
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

export interface IUpsertInventoryEventPayload extends Pick<RequestUser, 'username' | 'display_name'> {
	po?: string
	mo_no: string
	sizes: string[]
}
