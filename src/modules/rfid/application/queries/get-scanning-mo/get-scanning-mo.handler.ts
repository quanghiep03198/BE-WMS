import { IRFIDRepository } from '@/modules/rfid/domain/repositories/rfid.repository.interface'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { GetScanningMOsQuery } from './get-scanning-mo.query'

@QueryHandler(GetScanningMOsQuery)
export class GetScanningMOsHandler implements IQueryHandler<GetScanningMOsQuery> {
	constructor(private readonly rfidRepository: IRFIDRepository) {}

	public async execute({ params }: GetScanningMOsQuery) {
		return await this.rfidRepository.getScanningMOs(params)
	}
}
