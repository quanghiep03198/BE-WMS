import { StockFlow } from '@modules/finished-goods/domain/types'
import { Query } from '@nestjs/cqrs'
import { IStockTransaction } from '../../types'

export class GetCurrentStockTxQuery extends Query<IStockTransaction<StockFlow>[]> {
	constructor(public readonly stockFlow: StockFlow) {
		super()
	}
}
