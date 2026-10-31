import { IDefectiveGoodsProps } from '@modules/defective-goods/domain/models/defective-goods.model'

export const DEFECTIVE_GOODS_CACHE_REPOSITORY = 'DEFECTIVE_GOODS_CACHE_REPOSITORY'

export interface IDefectiveGoodsCacheRepository {
	setCount(filter: Partial<IDefectiveGoodsProps>, count: number): Promise<number>
	getCount(filter: Partial<IDefectiveGoodsProps>): Promise<number>
	flushCount(): Promise<void>
}
