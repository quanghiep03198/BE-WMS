import { TRequestUser } from '@common/decorators'
import { IDefectiveGoods } from '@modules/defective-goods/domain/interfaces'
import { Command } from '@nestjs/cqrs'
import { UpdateInboundStatusDTO } from '../../dto/inoutbound.dto'

export class StockInDefectiveGoodsCommand extends Command<void> {
	constructor(
		public readonly data: UpdateInboundStatusDTO,
		public readonly updatedBy: TRequestUser,
		public readonly filters: Partial<IDefectiveGoods> = {},
		public readonly take: number
	) {
		super()
	}
}
