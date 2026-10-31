import { Command } from '@nestjs/cqrs'
import { UpdateDefectiveGoodsDTO } from '../../dto/defective-goods.dto'

export class UpdateDefectiveGoodsCommand extends Command<void> {
	constructor(
		public readonly id: string,
		public readonly update: UpdateDefectiveGoodsDTO,
		public readonly updatedBy: TObjectId
	) {
		super()
	}
}
