import { ElectronicProductCode } from '@modules/finished-goods/domain/value-objects/epc.vo'

export interface IInventoryLedgerMongoRepository {
	getPendingInventoryFluctuation(scannedEpcs: Array<ElectronicProductCode>): Promise<
		Array<{
			mo_no: string
			po: string | null | undefined
			factory_code_produce: string
			factory_shoes_style: string
			color_sn: string
			size_ledger: Record<
				string,
				{ stocked_in_qty: number; total_recall_tx: number; total_return_tx: number; shipped_out_qty: number }
			>
		}>
	>

	getMoInventory(
		manufacturingOrder: string
	): Promise<Array<{ mo_no: string; size_numcode: string; order_qty: number; accumulated_qty: number }>>

	commitInventoryLedgerOnStockIn(
		pendingStockInEpcs: Array<ElectronicProductCode>
	): ReturnType<IInventoryLedgerMongoRepository['getPendingInventoryFluctuation']>

	commitInventoryLedgerOnStockOut(
		pendingShipOutEpcs: Array<ElectronicProductCode>
	): ReturnType<IInventoryLedgerMongoRepository['getPendingInventoryFluctuation']>

	commitInventoryLedgerOnRecall(
		pendingRecallEpcs: Array<ElectronicProductCode>
	): ReturnType<IInventoryLedgerMongoRepository['getPendingInventoryFluctuation']>
}

export const INVENTORY_LEDGER_MG_REPOSITORY = Symbol('IInventoryLedgerMongoRepository')
