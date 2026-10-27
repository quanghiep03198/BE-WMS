import { TRequestUser } from '@common/decorators'
import { UpdateOutboundStatusDTO } from '../../dto/inoutbound.dto'

export class StockOutDefectiveGoodsCommand {
	constructor(
		public readonly data: UpdateOutboundStatusDTO,
		public readonly user: TRequestUser
	) {}
}
