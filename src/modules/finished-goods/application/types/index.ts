import { StockFlow } from '@modules/finished-goods/domain/types'
import { ISizeLedgerFluctuation } from '../ports/inventory-ledger-mongo.repository.port'

export interface IStockTransaction<T extends StockFlow> {
	id: string
	mo_no?: string
	po?: T extends 'outbound' ? string : never
	qty: number
	tx_at: string
	tx_type: T extends 'outbound' ? 'stock_out' : T extends 'inbound' ? 'stock_in' | 'recall' : never
	changes: T extends 'outbound'
		? Array<{ mo_no: string; size_ledger: Record<string, ISizeLedgerFluctuation> }>
		: Record<string, ISizeLedgerFluctuation>
	reversed: boolean
}
