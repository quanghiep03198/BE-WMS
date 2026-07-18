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

	public async execute({ deviceSerialNumber }: GetInternalEpcsExistsQuery) {
		const existedRecord = await this.finishedGoodsEpcModel
			.exists({
				scannable: true,
				inbound_device_sn: deviceSerialNumber,
				epc: { $regex: /^E28/ }
			})
			.hint('idx_inbound_active')
			.lean(true)

		return Boolean(existedRecord)
	}
}
