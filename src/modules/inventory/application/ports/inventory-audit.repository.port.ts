import { IPendingInventoryFluctuation } from '@modules/finished-goods/application/ports/inventory-ledger-mongo.repository.port'
import { IInventoryReportResponse } from '@modules/inventory/application/interfaces'
import { InventoryClosureStatus } from '@modules/inventory/domain/constants'

export interface IInventoryAuditRepository {
	getMonthlyInventoryAudit(month: string, manufacturingOrders?: Array<string>): Promise<IInventoryReportResponse>

	getInventoryAuditClosureStatus(month: string): Promise<Array<InventoryClosureStatus>>

	updateInventoryAuditFluctuation(
		inventoryFluctuationData:
			| IPendingInventoryFluctuation
			| Pick<IPendingInventoryFluctuation, 'mo_no' | 'size_ledger'>
			| Array<IPendingInventoryFluctuation>,
		storageLocations?: string
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
