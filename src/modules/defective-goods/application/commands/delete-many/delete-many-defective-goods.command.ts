import { Command } from '@nestjs/cqrs'
import { DeleteManyDefectiveGoodsDTO } from '../../dto/defective-goods.dto'

export class DeleteManyDefectiveGoodsCommand extends Command<void> {
	constructor(
		public readonly filters: DeleteManyDefectiveGoodsDTO,
		public readonly username: string
	) {
		super()
	}
}
