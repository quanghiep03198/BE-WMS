import { IDefectiveGoods } from '@modules/defective-goods/domain/interfaces'

export const DEFECTIVE_GOODS_CACHE_REPOSITORY = 'DEFECTIVE_GOODS_CACHE_REPOSITORY'

export interface IDefectiveGoodsCacheRepository {
	setCount(filter: Partial<IDefectiveGoods>, count: number): Promise<number>
	getCount(filter: Partial<IDefectiveGoods>): Promise<number>
}
