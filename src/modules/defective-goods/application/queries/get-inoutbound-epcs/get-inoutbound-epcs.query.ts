import { IDefectiveGoods } from '@modules/defective-goods/domain/interfaces'
import { Query } from '@nestjs/cqrs'

export class GetInoutboundEpcsQuery extends Query<Pick<Pagination<IDefectiveGoods>, 'data' | 'totalDocs'>> {
	constructor(
		public readonly stockFlow: 'inbound' | 'outbound',
		public readonly filters: Partial<IDefectiveGoods>,
		public readonly take: number
	) {
		super()
	}
}
