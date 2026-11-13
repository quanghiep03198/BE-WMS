import { format } from 'date-fns'

export type StockTransactionType = 'stock_in' | 'stock_out' | 'recall'

export function stockTransactionIdKey(type: StockTransactionType, date: Date): string {
	const prefixes: Record<StockTransactionType, string> = { recall: 'RC', stock_in: 'SI', stock_out: 'XF' }
	return `${prefixes[type]}-${format(date, 'yyMMdd')}`
}

export function formatStockTransactionId(key: string, sequence: number): string {
	return `${key}-${String(sequence).padStart(3, '0')}`
}
