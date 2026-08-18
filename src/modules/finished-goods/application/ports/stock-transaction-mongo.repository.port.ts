import { ElectronicProductCode } from '@modules/finished-goods/domain/value-objects/epc.vo'

export interface IStockTransactionMongoRepository {
	stockIn(pendingStockInEpcs: Array<ElectronicProductCode>): Promise<void>
	stockOut(pendingShipOutEpcs: Array<ElectronicProductCode>): Promise<void>
	recallFromStock(pendingRecallEpcs: Array<ElectronicProductCode>): Promise<void>
}

export const STOCK_TRANSACTION_MONGO_REPOSITORY = Symbol('IStockTransactionMongoRepository')
