import { AggregateRoot } from '@nestjs/cqrs'
import { StockFlow } from '../types'

type TFluctuation<T = StockFlow> = Record<
	string,
	T extends 'inbound'
		? {
				stocked_in_qty: number
				total_recall_tx: number
				total_return_tx: number
			}
		: T extends 'outbound'
			? { shipped_out_qty: number }
			: never
>

export class RollbackStockTransaction extends AggregateRoot {
	constructor(
		public readonly stockFlow: StockFlow,
		public readonly fluctuation: TFluctuation<RollbackStockTransaction['stockFlow']>,
		public readonly transactionData: Record<
			string,
			{
				stocked_in_qty: number
				total_recall_tx: number
				total_return_tx: number
				shipped_out_qty: number
			}
		>
	) {
		super()
	}

	public startTransaction() {}
}
