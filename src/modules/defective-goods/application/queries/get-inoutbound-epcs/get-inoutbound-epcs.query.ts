import { IDefectiveGoods } from '@modules/defective-goods/domain/interfaces'
import { Query } from '@nestjs/cqrs'

export class GetInoutboundEpcsQuery extends Query<IDefectiveGoods[]> {
	constructor(
		public readonly stockFlow: 'inbound' | 'outbound',
		public readonly filters: Partial<IDefectiveGoods> & { take?: number },
		public readonly take?: number
	) {
		super()
	}
}
