import { IInventoryReportResponse } from '@modules/inventory/application/interfaces'
import { InventoryClosureStatus } from '@modules/inventory/domain/constants'

export interface IInventoryAuditRepository {
	getMonthlyInventoryAudit(month: string, manufacturingOrders?: Array<string>): Promise<IInventoryReportResponse>

	getInventoryAuditClosureStatus(month: string): Promise<Array<InventoryClosureStatus>>

	updateInventoryAuditVariation(
		pendingVariation: {
			mo_no: string
			po: string
			factory_code_produce: string
			factory_shoes_style: string
			color_sn: string
			inventory_variation: Record<
				string,
				{
					stocked_in_qty: number
					total_recall_tx: number
					total_return_tx: number
					shipped_out_qty: number
				}
			>
		}[],
		storageLocations?: Array<string>
	): Promise<void>

	saveSupplementalQty(
		filter: { mo_no: string; year_month: string },
		update: Record<
			| `inventory_variation.${string}.supplemental_stocked_in_qty`
			| `inventory_variation.${string}.supplemental_shipped_out_qty`,
			number
		>
		// update: {
		// 	supplemental_stocked_in_qty?: number
		// 	supplemental_shipped_out_qty?: number
		// 	size_numcode?: string
		// }[]
	): Promise<void>

	checkoutInventoryAudit(month: string): Promise<any[]>
}

export const INVENTORY_AUDIT_REPOSITORY = Symbol('IInventoryAuditRepository')
