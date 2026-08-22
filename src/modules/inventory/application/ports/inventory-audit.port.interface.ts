import { IInventoryReportResponse } from '@modules/inventory/application/interfaces'
import { InventoryClosureStatus } from '@modules/inventory/domain/constants'

export interface IInventoryAuditRepository {
	getMonthlyInventoryAudit(month: string, manufacturingOrders?: Array<string>): Promise<IInventoryReportResponse>

	getInventoryAuditClosureStatus(month: string): Promise<Array<InventoryClosureStatus>>

	updateInventoryAuditFluctuation(
		inventoryFluctuationData: {
			mo_no: string
			po?: string
			factory_code_produce?: string
			factory_shoes_style?: string
			color_sn?: string
			size_ledger: Record<
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
			`size_ledger.${string}.supplemental_stocked_in_qty` | `size_ledger.${string}.supplemental_shipped_out_qty`,
			number
		>
	): Promise<void>

	checkoutInventoryAudit(month: string): Promise<any[]>
}

export const INVENTORY_AUDIT_REPOSITORY = Symbol('IInventoryAuditRepository')
