import { StockFlow } from '@modules/finished-goods/domain/types'
import { ISizeLedgerFluctuation } from '../ports/inventory-ledger.repository.port'

export type StockTxType = 'stock_in' | 'recall'
export type ShippingTxType = 'stock_out'

export interface IInoutboundTransaction<T extends StockFlow> {
	id: string
	mo_no?: string
	po?: T extends Extract<StockFlow, 'outbound'> ? string : never
	qty: number
	tx_at: string
	tx_type: T extends Extract<StockFlow, 'outbound'> ? ShippingTxType : T extends 'inbound' ? StockTxType : never
	changes: T extends Extract<StockFlow, 'outbound'>
		? Array<{ mo_no: string; size_ledger: Record<string, Pick<ISizeLedgerFluctuation, 'shipped_out_qty'>> }>
		: Record<string, ISizeLedgerFluctuation>
	voided: boolean
}
