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
import { RetriveDeletedEpcsQuery } from './retrive-deleted-epcs.query'

@QueryHandler(RetriveDeletedEpcsQuery)
export class RetriveDeletedEpcsHandler implements IQueryHandler<RetriveDeletedEpcsQuery> {
	constructor(
		@InjectModel(FinishedGoodsEpc.name, DATA_WAREHOUSE_CONNECTION)
		private readonly finishedGoodsEpcModel: FinishedGoodsEpcModel,
		@InjectPinoLogger(RetriveDeletedEpcsHandler.name) private readonly logger: PinoLogger
	) {}

	public async execute({ stockFlow, filterQuery, pagination }: RetriveDeletedEpcsQuery) {
		const filterCase = {
			isInboundFlow: stockFlow === 'inbound',
			isOutboundFlow: stockFlow === 'outbound',
			outboundScanDetected: filterQuery.outbound_device_sn === 'dectectable',
			outboundScanNotDetected: filterQuery.outbound_device_sn === 'undetectable'
		}

		const queryHint: Record<StockFlow, mongo.Hint> = {
			inbound: 'idx_specs_inbound',
			outbound: 'idx_specs_outbound'
		}

		const query = MongoQueryBuilder.from(omitBy(filterQuery, (value) => value === ''))
			.withEqualFields('scannable', 'deleted', 'mo_no', 'factory_shoes_style', 'size_numcode')
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

		// const data = await this.finishedGoodsEpcModel.findDeleted(
		// 	query,
		// 	{ _id: 0, epc: 1, mo_no: 1, factory_shoes_style: 1, color_sn: 1, size_numcode: 1, scannable: 1 },
		// 	{ lean: true, hint: queryHint[stockFlow], limit: pagination.limit }
		// )

		// return {
		// 	page: 1,
		// 	limit: pagination.limit,
		// 	data,
		// 	totalDocs: data.length,
		// 	hasNextPage: false,
		// 	hasPrevPage: false,
		// 	nextPage: null,
		// 	prevPage: null,
		// 	totalPages: 1
		// } satisfies Pagination<{
		// 	epc: string
		// 	mo_no: string
		// 	factory_shoes_style: string
		// 	color_sn: string
		// 	size_numcode: string
		// }>

		return await this.finishedGoodsEpcModel.paginate(query, {
			page: pagination.page,
			limit: pagination.limit,
			customLabels: { docs: 'data' },
			customFind: 'findDeleted',
			lean: true,
			useCustomCountFn: async () => {
				return await this.finishedGoodsEpcModel.countDocumentsDeleted(query, { hint: queryHint[stockFlow] })
			},
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
				hint: queryHint[stockFlow]
			}
		})
	}
}
