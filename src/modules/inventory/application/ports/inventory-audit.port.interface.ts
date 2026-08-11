import { IInventoryReportResponse } from '@modules/inventory/application/interfaces'

export interface IInventoryAuditRepository {
	getMonthlyInventoryAudit(month: string, manufacturingOrders?: Array<string>): Promise<IInventoryReportResponse>

	updateInventorySupplementalQty(
		filter: { mo_no: string; year_month: string },
		update: {
			supplemental_stocked_in_qty?: number
			supplemental_shipped_out_qty?: number
			size_numcode?: string
		}[]
	): Promise<void>

	checkoutInventoryAudit(month: string): Promise<any[]>
}

export const INVENTORY_AUDIT_REPOSITORY = Symbol('IInventoryAuditRepository')
