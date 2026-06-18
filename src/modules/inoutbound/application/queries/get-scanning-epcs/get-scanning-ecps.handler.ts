import {
	IInoutboundMongoRepository,
	IO_MONGO_REPOSITORY
} from '@/modules/inoutbound/domain/repositories/io-mongo.repository.interface'
import { Inject } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { GetScanningEpcsQuery } from './get-scanning-epcs.query'

@QueryHandler(GetScanningEpcsQuery)
export class GetScanningEpcsHandler implements IQueryHandler<GetScanningEpcsQuery> {
	constructor(@Inject(IO_MONGO_REPOSITORY) private readonly inventoryEpcRepository: IInoutboundMongoRepository) {}

	public async execute({ params }: GetScanningEpcsQuery) {
		return await this.inventoryEpcRepository.getPaginatedScanningEpcs(params)
	}
}
