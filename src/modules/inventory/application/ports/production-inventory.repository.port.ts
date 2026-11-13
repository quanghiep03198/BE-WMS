import { ExportProductionInventoryQuery } from '../queries/export-production-inventory/export-production-inventory.query'
import { GetProductionInventoryQuery } from '../queries/get-production-inventory/get-production-inventory.query'

export interface IProductionInventory {
	inbound: Array<{
		mo_no: string
		last_inbound_date?: Date
		order_qty: number
		instock_qty: number
		size_ledger: Array<{
			size_numcode: string
			qty: number
		}>
	}>
	outbound: Array<{
		po: string
		order_qty: number
		outbound_qty: number
		last_outbound_date: Date
		size_ledger: Array<{
			size_numcode: string
			qty: number
		}>
	}>
	sizes: Array<{
		size_numcode: string
		qty: number
	}>
}

export interface IProductionInventoryRepository {
	getProductionInventory(query: GetProductionInventoryQuery): Promise<IProductionInventory>
	getInstockManufacturingOrders(query: GetProductionInventoryQuery | ExportProductionInventoryQuery): Promise<
		{
			mo_no: string
			last_inbound_date?: Date
			order_qty: number
			instock_qty: number
			size_ledger: Array<{
				size_numcode: string
				qty: number
			}>
		}[]
	>
}

export const PRODUCTION_INVENTORY_REPOSITORY = Symbol('IProductionInventoryRepository')
