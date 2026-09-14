import { FinishedGoodsEpcStatus } from '@modules/finished-goods/domain/constants'
import { StockFlow } from '@modules/finished-goods/domain/types'
import { ElectronicProductCode } from '@modules/finished-goods/domain/value-objects/epc.vo'
import { IPendingInventoryFluctuation } from './inventory-ledger.repository.port'

export interface IStockTransactionRepository {
	getStockTransactionById(
		stockFlow: StockFlow,
		transactionId: string
	): Promise<IPendingInventoryFluctuation | Array<IPendingInventoryFluctuation>>
	stockIn(transactionId: string, pendingStockInEpcs: Array<ElectronicProductCode>): Promise<void>
	stockOut(
		transactionId: string,
		purchaseOrder: string,
		pendingShipOutEpcs: Array<ElectronicProductCode>
	): Promise<void>
	recallFromStock(transactionId: string, pendingRecallEpcs: Array<ElectronicProductCode>): Promise<void>
	rollbackInboundTransaction(transactionId: string): Promise<Array<{ epc: string; status: FinishedGoodsEpcStatus }>>
	rollbackOutboundTransaction(transactionId: string): Promise<Array<{ epc: string; status: FinishedGoodsEpcStatus }>>
}

export const STOCK_TX_REPOSITORY = Symbol('IStockTransactionRepository')
