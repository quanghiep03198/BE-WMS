import { TRequestUser } from '@common/decorators'
import { IDefectiveGoods } from '@modules/defective-goods/domain/interfaces'
import { Command } from '@nestjs/cqrs'
import { UpdateOutboundStatusDTO } from '../../dto/inoutbound.dto'

export class StockOutDefectiveGoodsCommand extends Command<void> {
	constructor(
		public readonly data: UpdateOutboundStatusDTO,
		public readonly updatedBy: TRequestUser,
		public readonly filters: Partial<IDefectiveGoods> = {},
		public readonly take?: number
	) {
		super()
	}
}
