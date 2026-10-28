import { IDefectiveGoods } from '@modules/defective-goods/domain/interfaces'
import { Command } from '@nestjs/cqrs'

export class CreateDefectiveGoodsCommand extends Command<IDefectiveGoods[]> {
	constructor(
		public readonly items: Partial<IDefectiveGoods>[],
		public readonly username: string
	) {
		super()
	}
}
