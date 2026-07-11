import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import {
	FinishedGoodsEpc,
	FinishedGoodsEpcModel
} from '@modules/finished-goods/infrastructure/persistence/mongodb/schemas/finished-goods-epc.schema'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectModel } from '@nestjs/mongoose'
import { GetInternalEpcsExistsQuery } from './get-internal-epcs-exists.query'

@QueryHandler(GetInternalEpcsExistsQuery)
export class GetInternalEpcsExistsHandler implements IQueryHandler<GetInternalEpcsExistsQuery> {
	constructor(
		@InjectModel(FinishedGoodsEpc.name, DATA_WAREHOUSE_CONNECTION)
		private readonly finishedGoodsEpcModel: FinishedGoodsEpcModel
	) {}

	public async execute({ params }: GetInternalEpcsExistsQuery) {
		const existedRecord = await this.finishedGoodsEpcModel
			.exists({
				scannable: true,
				epc: { $regex: /^E28/i },
				...(params['inbound_device_sn:eq'] && { inbound_device_sn: params['inbound_device_sn:eq'] }),
				...(params['outbound_device_sn:eq'] && { outbound_device_sn: params['outbound_device_sn:eq'] })
			})
			.lean(true)

		return Boolean(existedRecord)
	}
}
