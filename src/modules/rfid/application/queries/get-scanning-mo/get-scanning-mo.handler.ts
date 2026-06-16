import { RFIDRepository } from '@/modules/rfid/infrastructure/repositories/rfid.repository'
import { ScannedOrderDetail } from '@/modules/rfid/infrastructure/types'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { GetScanningMOsQuery } from './get-scanning-mo.query'

@QueryHandler(GetScanningMOsQuery)
export class GetScanningMOsHandler implements IQueryHandler<GetScanningMOsQuery, ScannedOrderDetail[]> {
	constructor(private readonly rfidRepository: RFIDRepository) {}

	public async execute({ params }: GetScanningMOsQuery) {
		return await this.rfidRepository.getScanningMOs(params)
	}
}
