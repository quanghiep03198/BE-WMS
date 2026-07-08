import { DATA_WAREHOUSE_CONNECTION } from '@/databases/constants'
import { ScannedOrderDetail } from '@/modules/inoutbound/domain/types'
import {
	InventoryEpc,
	InventoryEpcModel
} from '@/modules/inoutbound/infrastructure/persistence/mongodb/schemas/inventory-epc.schema'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectModel } from '@nestjs/mongoose'
import { GetScanningMosQuery } from './get-scanning-mo.query'

@QueryHandler(GetScanningMosQuery)
export class GetScanningMosHandler implements IQueryHandler<GetScanningMosQuery> {
	constructor(
		@InjectModel(InventoryEpc.name, DATA_WAREHOUSE_CONNECTION) private readonly inventoryEpcModel: InventoryEpcModel
	) {}

	public async execute({ params }: GetScanningMosQuery) {
		return await this.inventoryEpcModel.aggregate<ScannedOrderDetail>(
			[
				// * Stage 1: Match documents that are not deleted
				{
					$match: {
						scannable: true,
						...(params['inbound_device_sn.eq'] && {
							inbound_device_sn: params['inbound_device_sn.eq'],
							inbound_at: null,
							outbound_at: null,
							po: null
						}),
						...(params['outbound_device_sn.eq'] && {
							outbound_device_sn: params['outbound_device_sn.eq'],
							inbound_at: { $ne: null },
							outbound_at: null,
							po: null
						})
					}
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
