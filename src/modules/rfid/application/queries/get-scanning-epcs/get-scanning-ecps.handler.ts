import { IRFIDRepository } from '@/modules/rfid/domain/repositories/rfid.repository.interface'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { GetScanningEpcsQuery } from './get-scanning-epcs.query'

@QueryHandler(GetScanningEpcsQuery)
export class GetScanningEpcsHandler implements IQueryHandler<GetScanningEpcsQuery> {
	constructor(private readonly rfidRepository: IRFIDRepository) {}

	public async execute({ params }: GetScanningEpcsQuery) {
		return await this.rfidRepository.getScanningEPCs(params)
	}
}
