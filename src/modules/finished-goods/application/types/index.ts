import { StockFlow } from '@modules/finished-goods/domain/types'

type StockTransactionType = 'stock_in' | 'recall' | 'stock_out'

export interface IStockTransaction<T = StockFlow> {
	id: string
	mo_no: string
	po?: T extends 'outbound' ? string : never
	qty: number
	tx_at: string
	tx_type: T extends 'outbound' ? 'stock_out' : T extends 'inbound' ? 'stock_in' | 'recall' : never
	changes: Record<
		string,
		{
			stocked_in_qty: number
			total_recall_tx: number
			total_return_tx: number
			shipped_out_qty: number
		}
	>
}
