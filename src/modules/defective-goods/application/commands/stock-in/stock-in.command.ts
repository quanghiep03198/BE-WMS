import { TRequestUser } from '@common/decorators'
import { Command } from '@nestjs/cqrs'
import { UpdateInboundStatusDTO } from '../../dto/inoutbound.dto'

export class StockInDefectiveGoodsCommand extends Command<void> {
	constructor(
		public readonly data: UpdateInboundStatusDTO,
		public readonly user: TRequestUser
	) {
		super()
	}
}
