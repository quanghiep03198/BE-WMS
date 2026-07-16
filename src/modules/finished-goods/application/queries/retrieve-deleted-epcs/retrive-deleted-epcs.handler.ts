import { MongoQueryBuilder } from '@common/helpers/mongo-query-builder'
import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import {
	FinishedGoodsEpc,
	FinishedGoodsEpcModel
} from '@modules/finished-goods/infrastructure/persistence/mongodb/schemas/finished-goods-epc.schema'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectModel } from '@nestjs/mongoose'
import { isEmpty, omitBy } from 'lodash'
import { RetriveDeletedEpcsQuery } from './retrive-deleted-epcs.query'

@QueryHandler(RetriveDeletedEpcsQuery)
export class RetriveDeletedEpcsHandler implements IQueryHandler<RetriveDeletedEpcsQuery> {
	constructor(
		@InjectModel(FinishedGoodsEpc.name, DATA_WAREHOUSE_CONNECTION)
		private readonly finishedGoodsEpcModel: FinishedGoodsEpcModel
	) {}

	public async execute({ stockFlow, filterQuery, pagination }: RetriveDeletedEpcsQuery) {
		const queryHint = (() => {
			let hint: string | undefined = undefined
			switch (true) {
				case stockFlow === 'inbound': {
					hint = 'idx_inventory_epc_inbound_scan_page'
					break
				}
				case stockFlow === 'outbound': {
					hint = 'idx_inventory_epc_outbound_scan_page'
					break
				}
				case !!filterQuery.mo_no: {
					hint = 'idx_inventory_epc_mo_scan_page'
					break
				}
			}
			return hint
		})()

		const filterCase = {
			isInboundFlow: stockFlow === 'inbound',
			isOutboundFlow: stockFlow === 'outbound',
			outboundScanDetected: filterQuery.outbound_device_sn === 'dectectable',
			outboundScanNotDetected: filterQuery.outbound_device_sn === 'undetectable'
		}

		const query = MongoQueryBuilder.from(omitBy(filterQuery, isEmpty))
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

		return await this.finishedGoodsEpcModel.paginate(query, {
			sort: { last_scanned_at: -1, epc: 1, mo_no: 1 },
			page: pagination.page,
			limit: pagination.limit,
			customLabels: { docs: 'data' },
			customFind: 'findDeleted',
			useCustomCountFn: async () => await this.finishedGoodsEpcModel.countDocumentsDeleted(query),
			lean: true,
			projection: {
				_id: 0,
				epc: 1,
				mo_no: 1,
				scannable: true,
				factory_shoes_style: 1,
				color_sn: 1,
				size_numcode: 1
			},
			options: {
				readPreference: 'nearest',
				hint: ['deleted_1', ...(queryHint ? [queryHint] : [])]
			}
		})
	}
}
