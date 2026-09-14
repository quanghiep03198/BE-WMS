import {
	FINISHED_GOODS_EPC_REPOSITORY,
	IFinishedGoodsEpcRepository
} from '@modules/finished-goods/application/ports/finished-goods-epc.repository.port'
import { Inject } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { GetScanningEpcsBySizeQuery } from './get-scanning-epcs-by-size.query'

@QueryHandler(GetScanningEpcsBySizeQuery)
export class GetScanningEpcsBySizeHandler implements IQueryHandler<GetScanningEpcsBySizeQuery> {
	constructor(
		@Inject(FINISHED_GOODS_EPC_REPOSITORY) private readonly epcMongoRepository: IFinishedGoodsEpcRepository
	) {}

	public async execute(query: GetScanningEpcsBySizeQuery) {
		return await this.epcMongoRepository.getScanningEpcsBySize(query)
	}
}
