import { IDefectiveGoods } from '@modules/defective-goods/domain/interfaces'

export class UpdateDefectiveGoodsCommand {
	constructor(
		public readonly id: string,
		public readonly data: IDefectiveGoods,
		public readonly username: string
	) {}
}
