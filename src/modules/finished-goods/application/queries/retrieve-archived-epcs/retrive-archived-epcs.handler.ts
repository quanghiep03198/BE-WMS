import { MongoQueryBuilder } from '@common/helpers/mongo-query-builder'
import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { StockFlow } from '@modules/finished-goods/domain/types'
import {
	FinishedGoodsEpc,
	FinishedGoodsEpcModel
} from '@modules/finished-goods/infrastructure/persistence/mongodb/schemas/finished-goods-epc.schema'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectModel } from '@nestjs/mongoose'
import { omitBy } from 'lodash'
import { mongo } from 'mongoose'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { RetriveArchivedEpcsQuery } from './retrive-archived-epcs.query'

@QueryHandler(RetriveArchivedEpcsQuery)
export class RetriveArchivedEpcsHandler implements IQueryHandler<RetriveArchivedEpcsQuery> {
	constructor(
		@InjectModel(FinishedGoodsEpc.name, DATA_WAREHOUSE_CONNECTION)
		private readonly finishedGoodsEpcModel: FinishedGoodsEpcModel,
		@InjectPinoLogger(RetriveArchivedEpcsHandler.name) private readonly logger: PinoLogger
	) {}

	public async execute({ stockFlow, filterQuery, pagination }: RetriveArchivedEpcsQuery) {
		const queryHint: Record<StockFlow, mongo.Hint> = {
			inbound: 'idx_specs_inbound',
			outbound: 'idx_specs_outbound'
		}

		const query = MongoQueryBuilder.from(omitBy(filterQuery, (value) => value === ''))
			.whereFieldsAreEqual('scannable', 'mo_no', 'factory_shoes_style', 'size_numcode', 'deleted')
			.whereLike('epc')
			.when(stockFlow === 'inbound', (builder) =>
				builder
					.whereEqual('inbound_times', 0)
					.whereFieldsAreNull('inbound_at', 'storage_location', 'outbound_device_sn')
			)
			.when(stockFlow === 'outbound', (builder) => {
				return builder
					.whereGreaterOrEqual('inbound_times', 1)
					.whereFieldsAreNotNull('inbound_at', 'storage_location')
					.whereFieldsAreNull('outbound_at', 'po')
					.when(filterQuery.deleted === true, (b) => b.whereFieldIsNotNull('outbound_device_sn'))
					.when(filterQuery.deleted === false, (b) => b.whereFieldIsNull('outbound_device_sn'))
			})
			.build()

		return await this.finishedGoodsEpcModel.paginate(query, {
			page: pagination.page,
			limit: pagination.limit,
			customLabels: { docs: 'data' },
			customFind: 'findWithDeleted',
			lean: true,
			useCustomCountFn: async () => {
				return await this.finishedGoodsEpcModel.countDocumentsWithDeleted(query, { hint: queryHint[stockFlow] })
			},
			projection: {
				_id: 0,
				epc: 1,
				mo_no: 1,
				scannable: true,
				factory_shoes_style: 1,
				color_sn: 1,
				size_numcode: 1,
				...(stockFlow === 'outbound' && {
					scanned: { $and: [{ $ne: ['$outbound_device_sn', null] }, { $eq: ['$deleted', true] }] }
				})
			},
			options: {
				readPreference: 'secondaryPreferred' satisfies mongo.ReadPreferenceMode,
				hint: queryHint[stockFlow]
			}
		})
	}
}
