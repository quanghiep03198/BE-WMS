import { Inject } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { DEFECTIVE_GOODS_REPOSITORY, IDefectiveGoodsRepository } from '../../ports/defective-goods.repository.port'
import { GetDefectiveGoodsQuery } from './get-defective-goods.query'

@QueryHandler(GetDefectiveGoodsQuery)
export class GetDefectiveGoodsHandler implements IQueryHandler<GetDefectiveGoodsQuery> {
	constructor(@Inject(DEFECTIVE_GOODS_REPOSITORY) private readonly repository: IDefectiveGoodsRepository) {}
	async execute({ filter, page, limit }: GetDefectiveGoodsQuery) {
		const result = await this.repository.paginate(filter, page, limit)
		return {
			...result,
			data: result.data.map((document) => {
				const item = document.toObject()
				return {
					...item,
					id: item._id.toString(),
					size_code: item.size_numcode,
					ri_type: item.combination_strategy,
					created: item.created_at,
					updated: item.updated_at
				}
			})
		}
	}
}
