import { TRequestUser } from '@common/decorators'
import { Command } from '@nestjs/cqrs'
import { CreateDefectiveGoodsDTO } from '../../dto/defective-goods.dto'

export class CreateDefectiveGoodsCommand extends Command<void> {
	constructor(
		public readonly payload: CreateDefectiveGoodsDTO,
		public readonly user: TRequestUser
	) {
		super()
	}
}
