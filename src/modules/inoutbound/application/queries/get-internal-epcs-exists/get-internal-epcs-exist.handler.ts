import {
	IInoutboundMongoRepository,
	INOUTBOUND_MONGO_REPOSITORY
} from '@/modules/inoutbound/domain/repositories/inventory-epc.repository.interface'
import { Inject } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { GetInternalEpcsExistsQuery } from './get-internal-epcs-exists.query'

@QueryHandler(GetInternalEpcsExistsQuery)
export class GetInternalEpcsExistsHandler implements IQueryHandler<GetInternalEpcsExistsQuery> {
	constructor(
		@Inject(INOUTBOUND_MONGO_REPOSITORY) private readonly inventoryEpcRepository: IInoutboundMongoRepository
	) {}

	public async execute({ params }: GetInternalEpcsExistsQuery) {
		return await this.inventoryEpcRepository.getInternalEPCExist(params)
	}
}
