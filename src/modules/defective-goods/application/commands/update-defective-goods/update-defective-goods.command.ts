import { Command } from '@nestjs/cqrs'
import { UpdateDefectiveGoodsDTO } from '../../dto/defective-goods.dto'

export class UpdateDefectiveGoodsCommand extends Command<void> {
	constructor(
		public readonly id: string,
		public readonly data: UpdateDefectiveGoodsDTO & { updated_by: TObjectId },
		public readonly username: string
	) {
		super()
	}
}
