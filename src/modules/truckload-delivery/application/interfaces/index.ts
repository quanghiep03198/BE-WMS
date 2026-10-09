import { DispatchOrderProps, PurchaseOrderLine } from '../../domain/models/dispatch-order.model'

export type DispatchOrderView = Omit<DispatchOrderProps, 'packing'> & {
	packing: Array<
		PurchaseOrderLine &
			Partial<{
				order_qty: number | null
				brand_name: string | null
				factory_shoes_style: string | null
				cust_shoes_style: string | null
				color_sn: string | null
				shipping_destination: string | null
				dispatched_outbound_qty: number
			}>
	>
}

export type DispatchOrderListItem = DispatchOrderView & {
	actual_snap_time: Date | null
	actual_departure_time: Date | null
}

export interface PurchaseOrderAttributes {
	po: string
	brand_name: string | null
	factory_shoes_style: string | null
	color_sn: string | null
	order_qty: number
}

export interface DispatchOrderDetailItem extends PurchaseOrderAttributes {
	outbound_qty: number
	dispatched_outbound_qty: number
	created: Date | null
	user_code_created: string | null
}

export interface SearchedPurchaseOrder extends PurchaseOrderAttributes {
	dispatched_outbound_qty: number
	max_outbound_qty: number
}
