import {
	EPC_MONGO_REPOSITORY,
	IEpcMongoRepository
} from '@modules/finished-goods/application/ports/epc-mongo.repository.port'
import { Inject } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { GetScanningEpcsBySizeQuery } from './get-scanning-epcs-by-size.query'

@QueryHandler(GetScanningEpcsBySizeQuery)
export class GetScanningEpcsBySizeHandler implements IQueryHandler<GetScanningEpcsBySizeQuery> {
	constructor(@Inject(EPC_MONGO_REPOSITORY) private readonly epcMongoRepository: IEpcMongoRepository) {}

	public async execute(query: GetScanningEpcsBySizeQuery) {
		return await this.epcMongoRepository.getScanningEpcsBySize(query)
	}
}
