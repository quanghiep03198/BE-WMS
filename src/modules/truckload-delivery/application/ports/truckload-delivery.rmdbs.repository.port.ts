import { DispatchOrderProps } from '../../domain/models/dispatch-order.model'

export interface ITruckloadDeliveryAuditRepository {
	/**
	 * Makes the MSSQL rows of a dispatch order identical to the given MongoDB snapshot
	 * (one row per purchase order). A `null` snapshot removes every row of the dispatch order.
	 */
	reconcileDispatchOrder(dispatchOrder: string, snapshot: DispatchOrderProps | null): Promise<void>
}

export const TRUCKLOAD_DELIVERY_AUDIT_REPOSITORY = Symbol('ITruckloadDeliveryRepositoryAudit')
