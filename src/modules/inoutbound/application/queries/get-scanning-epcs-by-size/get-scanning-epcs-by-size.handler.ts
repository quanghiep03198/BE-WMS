import { Inject } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { IIoMongoRepository, IO_MONGO_REPOSITORY } from '../../ports/io-mongo.repository.port'
import { GetScanningEpcsBySizeQuery } from './get-scanning-epcs-by-size.query'

@QueryHandler(GetScanningEpcsBySizeQuery)
export class GetScanningEpcsBySizeHandler implements IQueryHandler<GetScanningEpcsBySizeQuery> {
	constructor(@Inject(IO_MONGO_REPOSITORY) private readonly ioMongoRepository: IIoMongoRepository) {}

	public async execute(query: GetScanningEpcsBySizeQuery) {
		return await this.ioMongoRepository.getScanningEpcsBySize(query)
	}
}
