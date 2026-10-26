import { IDefectiveGoods } from '@modules/defective-goods/domain/interfaces'

export class UpsertDefectiveGoodsCommand {
	constructor(
		public readonly items: Partial<IDefectiveGoods>[],
		public readonly username: string
	) {}
}
