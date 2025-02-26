export interface IReportSearchParams {
	['factory_code.eq']: string
	['date.eq']?: string
}

export interface IInboundReport {
	mo_no: string
	mat_code: string
	mat_ecolor: string
	shoes_style_code_factory: string
	shaping_dept_name: string
	station_no: string
	order_qty: number
	inbound_qty: number
	inbound_date: Date | string
	is_exchanged: number
}
