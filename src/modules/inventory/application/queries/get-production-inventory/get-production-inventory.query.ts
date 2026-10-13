import { Query } from '@nestjs/cqrs'
import { IProductionInventory } from '../../ports/production-inventory.repository.port'

export class GetProductionInventoryQuery extends Query<IProductionInventory> {
	constructor(
		public readonly brandName: string,
		public readonly shoeStyle: string,
		public readonly color: string
	) {
		super()
	}
}
