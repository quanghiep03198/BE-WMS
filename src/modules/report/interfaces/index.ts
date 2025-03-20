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
	size_data: string
}

export interface IInboundReportQueryResult extends IReportQueryResult {
	daily_inbound_qty: number
	storage: string
}

export interface IOutboundReportQueryResult extends IReportQueryResult {
	daily_outbound_qty: number
}

export type IInboundReportResponse = Array<
	Omit<IInboundReportQueryResult, 'size_run'> & {
		size_data: Array<{ size_numcode: string; qty: number }>
	}
>

export type IOutboundReportResponse = Array<
	Omit<IOutboundReportQueryResult, 'size_run'> & {
		size_data: Array<{ size_numcode: string; qty: number }>
	}
>

export interface IInventoryReportQueryResult {
	brand_name: string
	po: string
	mo_no: string
	order_qty: number
	or_no: string
	shoes_style_code_factory: string | null
	init_inv_qty: number
	total_instock_qty: number
	total_outstock_qty: number
	actual_inv_qty: number
	final_inv_qty: number
	size_data: string
}

export type IInventoryReportResponse = Array<
	Omit<IInventoryReportQueryResult, 'size_data'> & {
		size_data: Array<{
			size_numcode: string
			init_inv_qty: number
			instock_qty: number
			outstock_qty: number
			final_inv_qty: number
		}>
	}
>
