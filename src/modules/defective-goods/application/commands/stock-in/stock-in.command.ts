import { TRequestUser } from '@common/decorators'
import { UpdateInboundStatusDTO } from '../../dto/inoutbound.dto'

export class StockInDefectiveGoodsCommand {
	constructor(
		public readonly data: UpdateInboundStatusDTO,
		public readonly user: TRequestUser
	) {}
}
