export interface IReportSearchParams {
	['factory_code.eq']: string
	['date.eq']?: string
}

export interface IReport {
	mo_no: string
	mat_code: string
	mat_ecolor: string
	shoes_style_code_factory: string
	shaping_dept_name: string
	order_qty: number
	factory_code: string
	size_run: Array<{ size_numcode: string; qty: number }>
}

export interface IInboundReport extends IReport {
	daily_inbound_qty: number
	storage: string
	is_exchanged?: number
}

export interface IOutboundReport extends IReport {
	daily_outbound_qty: number
}

export interface IMonthlyInventoryReport {
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
	size_data: Array<{
		size_numcode: string
		init_inv_qty: number
		instock_qty: number
		outstock_qty: number
		final_inv_qty: number
	}>
}
