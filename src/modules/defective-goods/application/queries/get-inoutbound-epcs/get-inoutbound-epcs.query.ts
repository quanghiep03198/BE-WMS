import { IDefectiveGoods } from '@modules/defective-goods/domain/interfaces'
import { Query } from '@nestjs/cqrs'
import { InoutboundEpcQueryDTO } from '../../dto/filter-query.dto'
import { IKeysetPagination } from '../../ports/defective-goods.repository.port'

export class GetInoutboundEpcsQuery extends Query<
	IKeysetPagination<
		Pick<
			IDefectiveGoods,
			| '_id'
			| 'epc'
			| 'defective_category'
			| 'brand_name'
			| 'po'
			| 'mo_no'
			| 'factory_shoes_style'
			| 'color_sn'
			| 'size_numcode'
			| 'unit'
		>
	>
> {
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
