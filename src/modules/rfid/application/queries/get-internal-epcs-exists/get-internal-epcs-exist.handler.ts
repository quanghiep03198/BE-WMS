import { IRFIDRepository, RFID_REPOSITORY } from '@/modules/rfid/domain/repositories/rfid.repository.interface'
import { Inject } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { GetInternalEpcsExistsQuery } from './get-internal-epcs-exists.query'

@QueryHandler(GetInternalEpcsExistsQuery)
export class GetInternalEpcsExistsHandler implements IQueryHandler<GetInternalEpcsExistsQuery> {
	constructor(@Inject(RFID_REPOSITORY) private readonly rfidRepository: IRFIDRepository) {}

	public async execute({ params }: GetInternalEpcsExistsQuery) {
		return await this.rfidRepository.getInternalEPCExist(params)
	}
}
