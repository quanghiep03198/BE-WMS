import { RFIDRepository } from '@/modules/rfid/infrastructure/repositories/rfid.repository'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { GetInternalEpcsExistsQuery } from './get-internal-epcs-exists.query'

@QueryHandler(GetInternalEpcsExistsQuery)
export class GetInternalEpcsExistsHandler implements IQueryHandler<GetInternalEpcsExistsQuery> {
	constructor(private readonly rfidRepository: RFIDRepository) {}

	public async execute({ params }: GetInternalEpcsExistsQuery) {
		return await this.rfidRepository.getInternalEpcsExist(params)
	}
}
