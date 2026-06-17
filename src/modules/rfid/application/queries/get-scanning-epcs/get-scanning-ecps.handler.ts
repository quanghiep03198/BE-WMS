import { IRFIDRepository, RFID_REPOSITORY } from '@/modules/rfid/domain/repositories/rfid.repository.interface'
import { Inject } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { GetScanningEpcsQuery } from './get-scanning-epcs.query'

@QueryHandler(GetScanningEpcsQuery)
export class GetScanningEpcsHandler implements IQueryHandler<GetScanningEpcsQuery> {
	constructor(@Inject(RFID_REPOSITORY) private readonly rfidRepository: IRFIDRepository) {}

	public async execute({ params }: GetScanningEpcsQuery) {
		return await this.rfidRepository.getScanningEPCs(params)
	}
}
