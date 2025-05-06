import { InventoryType } from '../constants'

export interface IReportSearchParams {
	['factory_code.eq']: string
	['date.eq']?: string
}

export interface IReportQueryResult {
	mo_no: string
	mat_code: string
	mat_ecolor: string
	shoes_style_code_factory: string
	shaping_dept_name: string
	order_qty: number
	factory_code: string
}

export interface IInboundReportQueryResult extends IReportQueryResult {
	size_data: string
	daily_inbound_qty: number
	storage: string
}

export interface IOutboundReportQueryResult extends IReportQueryResult {
	daily_outbound_qty: number
	detail: string
	overall: string
}

export type IInboundReportResponse = Array<
	IInboundReportQueryResult & {
		size_data: Array<{ size_numcode: string; qty: number }>
	}
>

export type IOutboundReportResponse = Array<
	IOutboundReportQueryResult & {
		detail: Array<{ mo_no: string; sizes: Array<{ size_numcode: string; qty: number }> }>
		overall: Array<{ size_numcode: string; po_size_qty: number; accumulated_qty: number; missing_qty: number }>
	}
>

export interface IInventoryReportQueryResult {
	brand_name: string
	po: string
	mo_no: string
	order_qty: number
	or_no: string
	inv_type: InventoryType
	shoes_style_code_factory: string | null
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
	mat_ecolor: string
	po_qty: number
	weighed_qty: number
	unweighed_qty: number
	size_data: string
}>
