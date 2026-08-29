import { ElectronicProductCode } from '@modules/finished-goods/domain/value-objects/epc.vo'

export interface IPendingInventoryFluctuation {
	mo_no: string
	po: string | null | undefined
	factory_code_produce: string
	factory_shoes_style: string
	color_sn: string
	size_ledger: Record<string, ISizeLedgerFluctuation>
}

export interface ISizeLedgerFluctuation {
	stocked_in_qty: number
	total_recall_tx: number
	total_return_tx: number
	shipped_out_qty: number
}

export interface IInventoryLedgerMongoRepository {
	getPendingInventoryFluctuation(
		scannedEpcs: Array<ElectronicProductCode>
	): Promise<IPendingInventoryFluctuation | Array<IPendingInventoryFluctuation>>

	getMoInventory(
		manufacturingOrder: string
	): Promise<Array<{ mo_no: string; size_numcode: string; order_qty: number; accumulated_qty: number }>>

	commitInventoryLedgerOnStockIn(
		transactionId: string,
		pendingStockInEpcs: Array<ElectronicProductCode>
	): Promise<IPendingInventoryFluctuation>

	commitInventoryLedgerOnStockOut(
		pendingShipOutEpcs: Array<ElectronicProductCode>
	): Promise<IPendingInventoryFluctuation[]>

	commitInventoryLedgerOnRecall(
		transactionId: string,
		pendingRecallEpcs: Array<ElectronicProductCode>
	): Promise<IPendingInventoryFluctuation>
}

export const INVENTORY_LEDGER_MG_REPOSITORY = Symbol('IInventoryLedgerMongoRepository')
