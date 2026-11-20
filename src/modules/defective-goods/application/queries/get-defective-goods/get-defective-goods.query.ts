import { FilterQueryDTO } from '../../dto/filter-query.dto'

export class GetDefectiveGoodsQuery {
	constructor(
		public readonly filter: Omit<FilterQueryDTO, 'page' | 'limit'>,
		public readonly page: number,
		public readonly limit: number
	) {}
}
