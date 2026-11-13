import { StockTransactionType } from '@modules/finished-goods/domain/value-objects/stock-transaction-id'

export const STOCK_TRANSACTION_ID_GENERATOR = Symbol('STOCK_TRANSACTION_ID_GENERATOR')

export interface IStockTransactionIdGenerator {
	nextId(type: StockTransactionType): Promise<string>
}
