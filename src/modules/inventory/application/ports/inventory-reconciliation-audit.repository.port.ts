import { TRequestUser } from '@common/decorators'

export interface IInventoryReconciliationAuditRepository {
	updateInventorySupplementalQty(
		yearMonth: string,
		manufacturingOrder: string,
		update: Array<{
			size_numcode: string
			supplemental_stocked_in_qty: number
			supplemental_shipped_out_qty: number
		}>,
		updatedBy: Pick<TRequestUser, 'username' | 'display_name'>
	)
}

export const INVENTORY_RECONCILIATION_AUDIT_REPOSITORY = Symbol('IInventoryReconciliationAuditRepository')
