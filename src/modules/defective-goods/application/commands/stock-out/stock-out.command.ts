import { TRequestUser } from '@common/decorators'
import { Command } from '@nestjs/cqrs'
import { UpdateOutboundStatusDTO } from '../../dto/inoutbound.dto'

export class StockOutDefectiveGoodsCommand extends Command<void> {
	constructor(
		public readonly data: UpdateOutboundStatusDTO,
		public readonly user: TRequestUser
	) {
		super()
	}
}
