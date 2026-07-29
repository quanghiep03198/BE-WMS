import { MongoQueryBuilder } from '@common/helpers/mongo-query-builder'
import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { FinishedGoodsEpcStatus } from '@modules/finished-goods/domain/constants'
import { StockFlow } from '@modules/finished-goods/domain/types'
import {
	FinishedGoodsEpc,
	FinishedGoodsEpcDocument,
	FinishedGoodsEpcModel
} from '@modules/finished-goods/infrastructure/persistence/mongodb/schemas/finished-goods-epc.schema'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectModel } from '@nestjs/mongoose'
import { FilterQuery, mongo } from 'mongoose'
import { GetScanningEpcsQuery } from './get-scanning-epcs.query'

@QueryHandler(GetScanningEpcsQuery)
export class GetScanningEpcsHandler implements IQueryHandler<GetScanningEpcsQuery> {
	constructor(
		@InjectModel(FinishedGoodsEpc.name, DATA_WAREHOUSE_CONNECTION)
		private readonly finishedGoodsEpcModel: FinishedGoodsEpcModel
	) {}

	public async execute({ stockFlow, pagination, filterQuery }: GetScanningEpcsQuery) {
		const queryHint: Record<StockFlow, mongo.Hint> = {
			inbound: 'idx_inbound_active',
			outbound: 'idx_outbound_active'
		}

		const query: FilterQuery<FinishedGoodsEpcDocument> = MongoQueryBuilder.from({
			scannable: true,
			deleted: false,
			status: FinishedGoodsEpcStatus.SCANNING,
			...filterQuery
		})
			.withEqualFields('scannable', 'deleted', 'mo_no', 'status')
			.when(stockFlow === 'inbound', (builder) =>
				builder.withEqualFields('inbound_device_sn').withNullishFields('storage_location', 'outbound_at')
			)
			.when(stockFlow === 'outbound', (builder) =>
				builder.withNullishFields('outbound_at').withNonNullableFields('outbound_device_sn', 'inbound_at')
			)
			.build()

		const paginateResult = await this.finishedGoodsEpcModel.paginate(query, {
			sort: { last_scanned_at: -1, epc: 1, mo_no: 1 },
			lean: true,
			page: pagination.page,
			limit: pagination.limit,
			customLabels: { docs: 'data' },
			projection: {
				_id: 0,
				epc: 1,
				mo_no: 1
			},
			options: {
				readPreference: 'nearest' satisfies mongo.ReadPreferenceMode,
				hint: queryHint[stockFlow]
			}
		})

		return {
			data: paginateResult.data as Record<'epc' | 'mo_no', string>[],
			page: paginateResult.page,
			limit: paginateResult.limit,
			hasNextPage: paginateResult.hasNextPage,
			hasPrevPage: paginateResult.hasPrevPage,
			nextPage: paginateResult.nextPage,
			prevPage: paginateResult.prevPage,
			totalDocs: paginateResult.totalDocs,
			totalPages: paginateResult.totalPages
		}
	}
}
