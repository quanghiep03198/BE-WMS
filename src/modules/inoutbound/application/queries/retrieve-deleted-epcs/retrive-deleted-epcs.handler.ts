import { DATA_WAREHOUSE_CONNECTION } from '@/databases/constants'
import {
	InventoryEpc,
	InventoryEpcModel
} from '@/modules/inoutbound/infrastructure/persistence/mongodb/schemas/inventory-epc.schema'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectModel } from '@nestjs/mongoose'
import { InventoryEpcQueryBuilder } from '../../../infrastructure/persistence/mongodb/helpers/inventory-epc-query-builder'
import { RetriveDeletedEpcsQuery } from './retrive-deleted-epcs.query'

@QueryHandler(RetriveDeletedEpcsQuery)
export class RetriveDeletedEpcsHandler implements IQueryHandler<RetriveDeletedEpcsQuery> {
	constructor(
		@InjectModel(InventoryEpc.name, DATA_WAREHOUSE_CONNECTION) private readonly inventoryEpcModel: InventoryEpcModel
	) {}

	public async execute({ flow, filterQuery, pagination }: RetriveDeletedEpcsQuery) {
		const query = InventoryEpcQueryBuilder.createQueryBuilder()
			.withEqual('scannable', true)
			.withEqual('mo_no', filterQuery.mo_no)
			.withEqual('factory_shoes_style', filterQuery.factory_shoes_style)
			.withEqual('size_numcode', filterQuery.size_numcode)
			.withLike('epc', filterQuery.epc)
			.withNull('inbound_at', flow === 'inbound')
			.withNull('outbound_at', flow === 'outbound')
			.withNotNull('inbound_at', flow === 'outbound')
			.withNull('outbound_device_sn', filterQuery.outbound_device_sn === 'none')
			.withNotNull('outbound_device_sn', filterQuery.outbound_device_sn === 'any')
			.build()

		console.log('GetArchivedEpcsHandler query:', query)

		return await this.inventoryEpcModel.paginate(query, {
			page: pagination.page,
			limit: pagination.limit,
			customLabels: { docs: 'data' },
			customFind: 'findDeleted',
			useCustomCountFn: async () => await this.inventoryEpcModel.countDocumentsDeleted(filterQuery),
			lean: true,
			projection: {
				_id: 0
			},
			options: { readPreference: 'nearest' }
		})
	}
}
