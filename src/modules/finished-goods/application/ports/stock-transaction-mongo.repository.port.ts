import { FinishedGoodsEpcStatus } from '@modules/finished-goods/domain/constants'
import { ElectronicProductCode } from '@modules/finished-goods/domain/value-objects/epc.vo'

export interface IStockTransactionMongoRepository {
	stockIn(transactionId: string, pendingStockInEpcs: Array<ElectronicProductCode>): Promise<void>
	stockOut(
		transactionId: string,
		purchaseOrder: string,
		pendingShipOutEpcs: Array<ElectronicProductCode>
	): Promise<void>
	recallFromStock(transactionId: string, pendingRecallEpcs: Array<ElectronicProductCode>): Promise<void>
	rollbackInboundTransaction(transactionId: string): Promise<Array<{ epc: string; status: FinishedGoodsEpcStatus }>>
}

export const STOCK_TX_MONGO_REPOSITORY = Symbol('IStockTransactionMongoRepository')
