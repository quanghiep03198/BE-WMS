import { IDefectiveGoods } from '@modules/defective-goods/domain/interfaces'
import { Query } from '@nestjs/cqrs'
import { InoutboundEpcQueryDTO } from '../../dto/filter-query.dto'

export class GetInoutboundEpcsQuery extends Query<Pick<Pagination<IDefectiveGoods>, 'data' | 'totalDocs'>> {
	constructor(
		public readonly stockFlow: 'inbound' | 'outbound',
		public readonly filters: Omit<InoutboundEpcQueryDTO, 'cursor' | 'direction' | 'page' | 'limit' | 'take'>,
		public readonly options: {
			readonly cursor: string | null
			readonly direction: 'next' | 'prev'
			readonly page: number
			readonly limit: number
			readonly take: number | null
		}
	) {
		super()
	}
}
