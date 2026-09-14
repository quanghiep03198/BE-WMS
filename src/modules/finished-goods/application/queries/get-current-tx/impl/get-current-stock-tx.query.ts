import { StockFlow } from '@modules/finished-goods/domain/types'
import { Query } from '@nestjs/cqrs'
import { IInoutboundTransaction } from '../../../types'

export class GetCurrentStockTxQuery extends Query<IInoutboundTransaction<StockFlow>[]> {
	constructor() {
		super()
	}
}
