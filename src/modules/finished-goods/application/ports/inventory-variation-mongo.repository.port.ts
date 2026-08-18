import { ElectronicProductCode } from '@modules/finished-goods/domain/value-objects/epc.vo'

export interface IInventoryVariationMongoRepository {
	getPendingInventoryVariation(scannedEpcs: Array<ElectronicProductCode>): Promise<
		Array<{
			mo_no: string
			po: string | null | undefined
			factory_code_produce: string
			factory_shoes_style: string
			color_sn: string
			inventory_variation: Record<
				string,
				{ stocked_in_qty: number; total_recall_tx: number; total_return_tx: number; shipped_out_qty: number }
			>
		}>
	>

	getMoInventory(
		manufacturingOrder: string
	): Promise<Array<{ mo_no: string; size_numcode: string; order_qty: number; accumulated_qty: number }>>

	applyInventoryVariationForStockIn(pendingStockInEpcs: Array<ElectronicProductCode>): Promise<void>

	applyInventoryVariationForStockOut(pendingShipOutEpcs: Array<ElectronicProductCode>): Promise<void>

	applyInventoryVariationForRecall(pendingRecallEpcs: Array<ElectronicProductCode>): Promise<void>
}

export const INVENTORY_VARIATION_MONGO_REPOSITORY = Symbol('IInventoryVariationMongoRepository')
