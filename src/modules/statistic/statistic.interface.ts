// 📊 Interface cho so sánh tồn kho từ đầu tháng đến hiện tại vs cùng kỳ tháng trước
export interface IMonthlyInventoryComparison {
	comparison_date: string
	current_period: string
	previous_period: string
	curr_period_inventory_qty: number
	prev_period_inventory_qty: number
	curr_month_initial_qty: number
	curr_month_final_qty: number
	curr_month_inbound: number
	curr_month_outbound: number
	prev_month_initial_qty: number
	prev_month_final_qty: number
	prev_month_inbound: number
	prev_month_outbound: number
}

// 📈 Interface cho so sánh nhập hàng từ đầu tháng đến hiện tại vs cùng kỳ tháng trước
export interface IMonthlyInboundComparison {
	curr_month_inbound_qty: number
	prev_month_inbound_qty: number
	inbound_qty_difference: number
	inbound_qty_percentage_change: number
	comparison_date: string
	current_period: string
	previous_period: string
}

// 📉 Interface cho so sánh xuất hàng từ đầu tháng đến hiện tại vs cùng kỳ tháng trước
export interface IMonthlyOutboundComparison {
	curr_month_outbound_qty: number
	prev_month_outbound_qty: number
	outbound_qty_difference: number
	outbound_qty_percentage_change: number
	comparison_date: string
	current_period: string
	previous_period: string
}

// � Interface cho thống kê nhập xuất theo tháng trong năm
export interface IMonthlyInOutboundStatistics {
	year: number
	month: number
	inbound_qty: number
	outbound_qty: number
	net_flow: number
	inbound_outbound_ratio: number
	total_transactions: number
	period_range: string
}

export interface IAnnuallyInOutboundStatistics {
	year: number
	month: number
	inbound_qty: number
	outbound_qty: number
	net_flow: number
	inbound_outbound_ratio: number
	total_transactions: number
	period_range: string
}
