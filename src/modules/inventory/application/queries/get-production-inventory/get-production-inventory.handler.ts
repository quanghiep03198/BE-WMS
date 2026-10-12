import { Inject } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import {
	IProductionInventoryRepository,
	PRODUCTION_INVENTORY_REPOSITORY
} from '../../ports/production-inventory.repository.port'
import { GetProductionInventoryQuery } from './get-production-inventory.query'

@QueryHandler(GetProductionInventoryQuery)
export class GetProductionInventoryHandler implements IQueryHandler<GetProductionInventoryQuery> {
	constructor(
		@Inject(PRODUCTION_INVENTORY_REPOSITORY)
		private readonly productionInventoryRepository: IProductionInventoryRepository
	) {}

	public async execute(query: GetProductionInventoryQuery) {
		return this.productionInventoryRepository.getProductionInventory(query)
	}
}
