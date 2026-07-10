import { MongoQueryBuilder } from '@common/helpers/mongo-query-builder'
import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import {
	InventoryEpc,
	InventoryEpcModel
} from '@modules/inoutbound/infrastructure/persistence/mongodb/schemas/inventory-epc.schema'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectModel } from '@nestjs/mongoose'
import { RetriveDeletedEpcsQuery } from './retrive-deleted-epcs.query'

@QueryHandler(RetriveDeletedEpcsQuery)
export class RetriveDeletedEpcsHandler implements IQueryHandler<RetriveDeletedEpcsQuery> {
	constructor(
		@InjectModel(InventoryEpc.name, DATA_WAREHOUSE_CONNECTION) private readonly inventoryEpcModel: InventoryEpcModel
	) {}

	public async execute({ flow, filterQuery, pagination }: RetriveDeletedEpcsQuery) {
		const filterCase = {
			isInboundFlow: flow === 'inbound',
			isOutboundFlow: flow === 'outbound',
			outboundScanDetected: filterQuery.outbound_device_sn === 'dectectable',
			outboundScanNotDetected: filterQuery.outbound_device_sn === 'undetectable'
		}

		const query = MongoQueryBuilder.createQueryBuilder(filterQuery)
			.withEqualFields('scannable', 'mo_no', 'factory_shoes_style', 'size_numcode')
			.withMatchRegexBy('epc')
			.when(filterCase.isInboundFlow, (builder) => builder.withNullBy('inbound_at'))
			.when(filterCase.isOutboundFlow, (builder) => {
				return builder
					.withNotEqualBy('inbound_at')
					.withNullBy('outbound_at')
					.when(filterCase.outboundScanDetected, (b) => b.withNotNullBy('outbound_device_sn'))
					.when(filterCase.outboundScanNotDetected, (b) => b.withNullBy('outbound_device_sn'))
			})
			.build()

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
