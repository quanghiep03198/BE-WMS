import { DATA_WAREHOUSE_CONNECTION } from '@/databases/constants'
import {
	InventoryEpc,
	InventoryEpcModel
} from '@/modules/inoutbound/infrastructure/persistence/mongodb/schemas/inventory-epc.schema'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectModel } from '@nestjs/mongoose'
import { GetArchivedEpcsQuery } from './get-archived-epcs.query'

@QueryHandler(GetArchivedEpcsQuery)
export class GetArchivedEpcsHandler implements IQueryHandler<GetArchivedEpcsQuery> {
	constructor(
		@InjectModel(InventoryEpc.name, DATA_WAREHOUSE_CONNECTION) private readonly inventoryEpcModel: InventoryEpcModel
	) {}

	public async execute(_query: GetArchivedEpcsQuery) {
		// TODO: Implement the logic to retrieve archived EPCs based on the provided query parameters.
	}
}
