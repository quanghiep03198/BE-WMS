import { GetProductionInventoryQuery } from '../queries/get-production-inventory/get-production-inventory.query'

export interface IProductionInventoryRepository {
	getProductionInventory(query: GetProductionInventoryQuery): Promise<any[]>
}

export const PRODUCTION_INVENTORY_REPOSITORY = Symbol('IProductionInventoryRepository')
