import { IDefectiveGoods } from '@modules/defective-goods/domain/interfaces'
import { Command } from '@nestjs/cqrs'

export class UpdateDefectiveGoodsCommand extends Command<void> {
	constructor(
		public readonly id: string,
		public readonly data: IDefectiveGoods,
		public readonly username: string
	) {
		super()
	}
}
