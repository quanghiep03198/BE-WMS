import { ElectronicProductCode } from '@modules/finished-goods/domain/value-objects/epc.vo'
import { IInoutboundTransaction } from '../types'

export interface ISizeLedgerFluctuation {
	stocked_in_qty: number
	total_recall_tx: number
	total_return_tx: number
	shipped_out_qty: number
}
export interface IPendingInventoryFluctuation {
	mo_no: string
	po: string | null | undefined
	factory_code_produce: string
	factory_shoes_style: string
	color_sn: string
	size_ledger: Record<string, ISizeLedgerFluctuation>
}

export interface IInventoryLedgerRepository {
	getPendingInventoryFluctuation(
		scannedEpcs: Array<ElectronicProductCode>
	): Promise<IPendingInventoryFluctuation | Array<IPendingInventoryFluctuation>>

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

	rollbackInboundFluctuation(transaction: IInoutboundTransaction<'inbound'>): Promise<void>

	rollbackOutboundFluctuation(transaction: IInoutboundTransaction<'outbound'>): Promise<void>
}

export const INVENTORY_LEDGER_REPOSITORY = Symbol('IInventoryLedgerRepository')
