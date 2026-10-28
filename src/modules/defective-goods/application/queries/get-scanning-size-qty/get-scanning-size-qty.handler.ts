import { Inject } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { DEFECTIVE_GOODS_REPOSITORY, IDefectiveGoodsRepository } from '../../ports/defective-goods.repository.port'
import { GetScanningSizeQtyQuery } from './get-scanning-size-qty.query'

@QueryHandler(GetScanningSizeQtyQuery)
export class GetScanningSizeQtyHandler implements IQueryHandler<GetScanningSizeQtyQuery> {
	constructor(
		@Inject(DEFECTIVE_GOODS_REPOSITORY)
		private readonly defectiveGoodsRepository: IDefectiveGoodsRepository
	) {}

	async execute({ epcs }: GetScanningSizeQtyQuery) {
		return this.defectiveGoodsRepository.getScanningSizeQty(epcs)
	}
}
