import { FinishedGoodsEpcStatus } from '@modules/finished-goods/domain/constants'
import { StockFlow } from '@modules/finished-goods/domain/types'
import { Command } from '@nestjs/cqrs'

export class CommitRollbackStockTxCommand extends Command<void> {
	constructor(
		public readonly stockFlow: StockFlow,
		public readonly rolledBackEpcs: Array<{ epc: string; status: FinishedGoodsEpcStatus }>
	) {
		super()
	}
}
