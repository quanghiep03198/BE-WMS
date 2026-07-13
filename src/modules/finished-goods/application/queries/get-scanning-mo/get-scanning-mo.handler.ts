import { MongoQueryBuilder } from '@common/helpers/mongo-query-builder'
import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { ScannedOrderDetail } from '@modules/finished-goods/domain/types'
import {
	FinishedGoodsEpc,
	FinishedGoodsEpcModel
} from '@modules/finished-goods/infrastructure/persistence/mongodb/schemas/finished-goods-epc.schema'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectModel } from '@nestjs/mongoose'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { GetScanningMosQuery } from './get-scanning-mo.query'

@QueryHandler(GetScanningMosQuery)
export class GetScanningMosHandler implements IQueryHandler<GetScanningMosQuery> {
	constructor(
		@InjectPinoLogger(GetScanningMosHandler.name) private readonly logger: PinoLogger,
		@InjectModel(FinishedGoodsEpc.name, DATA_WAREHOUSE_CONNECTION)
		private readonly finishedGoodsEpcModel: FinishedGoodsEpcModel
	) {}

	public async execute({ stockFlow, deviceSerialNumber }: GetScanningMosQuery) {
		const query = MongoQueryBuilder.from({
			scannable: true,
			inbound_device_sn: deviceSerialNumber,
			outbound_device_sn: undefined,
			inbound_at: undefined,
			outbound_at: undefined,
			po: undefined
		})
			.withEqualBy('scannable')
			.when(stockFlow === 'inbound', (builder) =>
				builder.withEqualBy('inbound_device_sn').withNullishFields('inbound_at', 'outbound_at', 'po')
			)
			.when(stockFlow === 'outbound', (builder) => builder.withNonNullableFields('outbound_device_sn', 'inbound_at'))
			.build()

		this.logger.debug(query)

		return await this.finishedGoodsEpcModel.aggregate<ScannedOrderDetail>(
			[
				// * Stage 1: Match documents that are not deleted
				{
					$match: query
				},
				// * Stage 2: Group by mo_no, color_sn, and factory_shoes_style, and aggregate sizes
				{
					$group: {
						_id: {
							mo_no: '$mo_no',
							color_sn: '$color_sn',
							factory_shoes_style: '$factory_shoes_style',
							factory_code_produce: '$factory_code_produce',
							size_numcode: '$size_numcode'
						},
						count: { $sum: 1 }
					}
				},
				// * Stage 3: Reshape the data to group sizes into an array
				{
					$group: {
						_id: {
							mo_no: '$_id.mo_no',
							color_sn: '$_id.color_sn',
							factory_shoes_style: '$_id.factory_shoes_style',
							factory_code_produce: '$_id.factory_code_produce'
						},
						sizes: {
							$push: {
								size_numcode: '$_id.size_numcode',
								count: '$count'
							}
						}
					}
				},
				// * Stage 4: Reshape the final output
				{
					$project: {
						_id: 0,
						mo_no: '$_id.mo_no',
						color_sn: '$_id.color_sn',
						factory_shoes_style: '$_id.factory_shoes_style',
						factory_code_produce: '$_id.factory_code_produce',
						sizes: 1
					}
				},
				// * Stage 5: Sort the results
				{ $sort: { mo_no: 1, color_sn: 1, factory_shoes_style: 1 } }
			],
			{ readPreference: 'nearest' }
		)
	}
}
