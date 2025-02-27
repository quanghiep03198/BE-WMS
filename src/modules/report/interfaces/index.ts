export interface IReportSearchParams {
	['factory_code.eq']: string
	['date.eq']?: string
}

interface IReport {
	mo_no: string
	mat_code: string
	mat_ecolor: string
	shoes_style_code_factory: string
	shaping_dept_name: string
	order_qty: number
	factory_code: string
}

export interface IInboundReport extends IReport {
	daily_inbound_qty: number
	is_exchanged?: number
}

export interface IOutboundReport extends IReport {
	daily_outbound_qty: number
}
