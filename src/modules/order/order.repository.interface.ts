import { LeanDocument } from 'mongoose'
import { ManufacturingOrderDocument } from './schemas/manufacturing-order.schema'
import { PurchaseOrderDocument } from './schemas/purchase-order.schema'
import { TManufacturingOrder } from './types'

export interface IOrderRepository {
	/**
	 * @description Search for manufacturing orders by a search term.
	 * @param searchTerm
	 */
	searchManufacturingOrder(searchTerm: string): Promise<Array<Record<'mo_no', string>>>

	searchPurchaseOrder(
		searchTerm: string,
		shouldFilterAllBrands?: boolean
	): Promise<Array<{ po: string; is_completed: boolean }>>

	/**
	 * @description Get one raw manufacturing order by its identifier and optional sequence number from MSSQL.
	 * @param manufacturingOrder
	 * @param moSeq
	 */
	getOneRawManufacturingOrder(manufacturingOrder: string, moSeq?: string): Promise<TManufacturingOrder>

	/**
	 * @description Get one manufacturing order by its identifier from MongoDB.
	 * @param manufacturingOrder
	 */
	getOneManufacturingOrder(manufacturingOrder: string): Promise<ManufacturingOrderDocument>

	/**
	 * @description Get one purchase order by its identifier from MongoDB.
	 * @param purchaseOrder
	 */
	getOnePurchaseOrder(purchaseOrder: string): Promise<LeanDocument<PurchaseOrderDocument>>

	/**
	 * @description Get the inventory of a manufacturing order by its identifier from MongoDB.
	 * @param manufacturingOrder
	 */
	getManufacturingOrderInventory(
		manufacturingOrder: string
	): Promise<Array<{ mo_no: string; size_numcode: string; order_qty: number; accumulated_qty: number }>>
}
