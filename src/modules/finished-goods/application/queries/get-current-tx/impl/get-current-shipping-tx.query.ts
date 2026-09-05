import { Query } from '@nestjs/cqrs'
import { IStockTransaction } from '../../../types'

export class GetCurrentShippingTxQuery extends Query<IStockTransaction<'outbound'>[]> {
	constructor() {
		super()
	}
}
