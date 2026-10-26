import { Inject } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { DEFECTIVE_GOODS_REPOSITORY, IDefectiveGoodsRepository } from '../../ports/defective-goods.repository.port'
import { CheckActiveEpcsQuery } from './check-active-epcs.query'

@QueryHandler(CheckActiveEpcsQuery)
export class CheckActiveEpcsHandler implements IQueryHandler<CheckActiveEpcsQuery, boolean> {
	constructor(@Inject(DEFECTIVE_GOODS_REPOSITORY) private readonly repository: IDefectiveGoodsRepository) {}
	async execute({ epcs }: CheckActiveEpcsQuery) {
		return Boolean(await this.repository.findOne({ epc: { $in: epcs } }))
	}
}
