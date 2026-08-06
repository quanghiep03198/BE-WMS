import { InventoryType } from '../constants'

export interface IReportSearchParams {
	['factory_code:eq']: string
	['date:eq']?: string
}

export interface IReportQueryResult {
	mo_no: string
	color_sn: string
	factory_shoes_style: string
	assembly_lines: Array<string>
	order_qty: number
	factory_code_produce: string
}

export interface IInboundReportQueryResult extends IReportQueryResult {
	// sizvảt_data: string
	daily_inbound_qty: number
	storage_locations: Array<string>
}

export interface IOutboundReportQueryResult extends IReportQueryResult {
	daily_outbound_qty: number
	detail: string
	overall: string
}

export type IInboundReportResponse = Array<
	IInboundReportQueryResult & {
		variation_details: Array<{ size_numcode: string; qty: number }>
	}
>

export type IOutboundReportResponse = Array<
	IOutboundReportQueryResult & {
		detail: Array<{ mo_no: string; sizes: Array<{ size_numcode: string; qty: number }> }>
		overall: Array<{ size_numcode: string; order_qty: number; daily_qty: number; missing_qty: number }>
	}
>

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

export type IDailyPackingReport = Array<{
	brand_name: string
	po: string
	shoestyle_codefactory: string
	color_sn: string
	po_qty: number
	weighed_qty: number
	unweighed_qty: number
	size_data: string
}>

export interface IInboundHistory {
	factory_code_produce: string
	mo_no: string
	brand_name: string
	shoe_style: string
	color: string
	mo_qty: number
	accumulated_inbound_qty: number
	progress: `${string}%`
	order_size_run:
		| string
		| Array<{
				size_numcode: string
				qty: number
		  }>
	inbound_history_by_size:
		| string
		| Array<{
				size_numcode: string
				qty: number
		  }>
	daily_inbound_history:
		| string
		| Array<{
				size_numcode: string
				qty: number
				inbound_date: Date
		  }>
}

export interface IOutboundHistory {
	po: string
	po_qty: number
	accumulated_outbound_qty: number
	missing_qty: number
	brand_name: string
	factory_shoes_style: string
	cust_shoes_style: string
	color_sn: string
	outbound_history:
		| string
		| Array<{
				outbound_date: string
				mo_no: string
				sizes: Array<{
					size_numcode: string
					qty: number
				}>
		  }>
	overall:
		| string
		| Array<{
				size_numcode: string
				po_size_qty: number
				acc_qty: number
				missing_qty: number
		  }>
	progress: `${string}%`
}
