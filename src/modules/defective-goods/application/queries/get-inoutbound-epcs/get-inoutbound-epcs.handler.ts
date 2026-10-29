import { Inject } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { DEFECTIVE_GOODS_REPOSITORY, IDefectiveGoodsRepository } from '../../ports/defective-goods.repository.port'
import { GetInoutboundEpcsQuery } from './get-inoutbound-epcs.query'

@QueryHandler(GetInoutboundEpcsQuery)
export class GetInoutboundEpcsHandler implements IQueryHandler<GetInoutboundEpcsQuery> {
	constructor(
		@Inject(DEFECTIVE_GOODS_REPOSITORY)
		private readonly defectiveGoodsRepository: IDefectiveGoodsRepository
	) {}

	public async execute({ stockFlow, take, filters }: GetInoutboundEpcsQuery) {
		return await this.defectiveGoodsRepository.getInoutboundEpcs(stockFlow, filters, take)
	}
}
