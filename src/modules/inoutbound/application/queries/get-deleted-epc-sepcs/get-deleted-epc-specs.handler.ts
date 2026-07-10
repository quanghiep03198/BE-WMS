import { VALID_EPC_PATTERN } from '@common/constants/regex'
import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { FALLBACK_VALUE } from '@modules/inoutbound/domain/constants'
import {
	InventoryEpc,
	InventoryEpcModel
} from '@modules/inoutbound/infrastructure/persistence/mongodb/schemas/inventory-epc.schema'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectModel } from '@nestjs/mongoose'
import { GetDeletedEpcSpecsQuery } from './get-deleted-epc-specs.query'

@QueryHandler(GetDeletedEpcSpecsQuery)
export class GetDeletedEpcSpecsHandler implements IQueryHandler<GetDeletedEpcSpecsQuery> {
	constructor(
		@InjectModel(InventoryEpc.name, DATA_WAREHOUSE_CONNECTION) private readonly inventoryEpcModel: InventoryEpcModel
	) {}

	public async execute() {
		return await this.inventoryEpcModel
			.aggregateDeleted<{
				factory_shoes_style: string
				colorways: Array<{
					color_sn: string
					batches: Array<{ mo_no: string; sizes: Array<string> }>
				}>
			}>([
				{
					$match: {
						epc: { $regex: VALID_EPC_PATTERN },
						mo_no: { $ne: FALLBACK_VALUE },
						size_numcode: { $ne: FALLBACK_VALUE },
						factory_shoes_style: { $ne: FALLBACK_VALUE },
						color_sn: { $ne: FALLBACK_VALUE }
					}
				},
				{
					$group: {
						_id: {
							factory_shoes_style: '$factory_shoes_style',
							color_sn: '$color_sn',
							mo_no: '$mo_no',
							size_numcode: '$size_numcode'
						}
					}
				},
				{
					$group: {
						_id: {
							factory_shoes_style: '$_id.factory_shoes_style',
							color_sn: '$_id.color_sn',
							mo_no: '$_id.mo_no'
						},
						sizes: {
							$push: '$_id.size_numcode'
						}
					}
				},
				{
					$group: {
						_id: {
							factory_shoes_style: '$_id.factory_shoes_style',
							color_sn: '$_id.color_sn'
						},
						batches: {
							$push: {
								mo_no: '$_id.mo_no',
								sizes: '$sizes'
							}
						}
					}
				},
				{
					$group: {
						_id: '$_id.factory_shoes_style',
						colorways: {
							$push: {
								color_sn: '$_id.color_sn',
								batches: '$batches'
							}
						}
					}
				},
				{
					$project: {
						_id: 0,
						factory_shoes_style: '$_id',
						colorways: '$colorways'
					}
				}
			])
			.exec()
	}
}
