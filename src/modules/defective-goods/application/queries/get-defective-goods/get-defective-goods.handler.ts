import { Inject } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { DEFECTIVE_GOODS_REPOSITORY, IDefectiveGoodsRepository } from '../../ports/defective-goods.repository.port'
import { GetDefectiveGoodsQuery } from './get-defective-goods.query'

@QueryHandler(GetDefectiveGoodsQuery)
export class GetDefectiveGoodsHandler implements IQueryHandler<GetDefectiveGoodsQuery> {
	constructor(@Inject(DEFECTIVE_GOODS_REPOSITORY) private readonly repository: IDefectiveGoodsRepository) {}
	async execute({ filter, page, limit }: GetDefectiveGoodsQuery) {
		return await this.repository.paginate(filter, { page, limit })
	}
}
