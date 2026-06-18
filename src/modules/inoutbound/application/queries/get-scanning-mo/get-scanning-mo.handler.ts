import {
	IInoutboundMongoRepository,
	IO_MONGO_REPOSITORY
} from '@/modules/inoutbound/domain/repositories/io-mongo.repository.interface'
import { Inject } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { GetScanningMOsQuery } from './get-scanning-mo.query'

@QueryHandler(GetScanningMOsQuery)
export class GetScanningMOsHandler implements IQueryHandler<GetScanningMOsQuery> {
	constructor(@Inject(IO_MONGO_REPOSITORY) private readonly inventoryEpcRepository: IInoutboundMongoRepository) {}

	public async execute({ params }: GetScanningMOsQuery) {
		return await this.inventoryEpcRepository.getScanningManufacturingOrders(params)
	}
}
