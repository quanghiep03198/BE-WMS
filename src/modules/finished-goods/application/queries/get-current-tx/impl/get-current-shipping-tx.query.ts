import { Query } from '@nestjs/cqrs'
import { IInoutboundTransaction } from '../../../types'

export class GetCurrentShippingTxQuery extends Query<IInoutboundTransaction<'outbound'>[]> {
	constructor() {
		super()
	}
}
