import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { GetScanningEpcsQuery } from './get-scanning-epcs.query'

@QueryHandler(GetScanningEpcsQuery)
export class GetScanningEpcsHandler implements IQueryHandler<GetScanningEpcsQuery> {
	constructor(private readonly rfidRepository) {}

	public async execute({ params }: GetScanningEpcsQuery) {
		return await this.rfidRepository.getScanningEpcs(params)
	}
}
