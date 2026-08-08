import { RequestUser } from '@common/decorators'
import { InventoryType } from '../constants'

export interface IInventoryReportQueryResult {
	brand_name: string
	po: string
	mo_no: string
	order_qty: number
	or_no: string
	inv_type: InventoryType
	storage: string
	factory_shoes_style: string | null
	total_storage_capacity: number
	total_number_of_storage: number
	init_inv_qty: number
	total_instock_qty: number
	total_outstock_qty: number
	actual_inv_qty: number
	final_inv_qty: number
	detail: string
	inv_year_month: string
}

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
	inventory_variation: Array<{
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

export interface IUpsertInventoryEventPayload extends Pick<RequestUser, 'username' | 'display_name'> {
	po?: string
	mo_no: string
	sizes: string[]
}
