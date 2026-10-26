import { IDefectiveGoods } from '@modules/defective-goods/domain/interfaces'
import { FilterQuery } from 'mongoose'
import {
	DefectiveGoods,
	DefectiveGoodsDocument
} from '../../infrastructure/persistence/mongodb/schemas/defective-goods.schema'

export const DEFECTIVE_GOODS_REPOSITORY = Symbol('DEFECTIVE_GOODS_REPOSITORY')

export interface IDefectiveGoodsRepository {
	createMany(items: Partial<IDefectiveGoods>[]): Promise<DefectiveGoodsDocument[]>
	findById(id: string): Promise<DefectiveGoodsDocument | null>
	findOne(filter: FilterQuery<DefectiveGoods>): Promise<DefectiveGoodsDocument | null>
	findOneForWrite(filter: FilterQuery<DefectiveGoods>): Promise<DefectiveGoodsDocument | null>
	paginate(
		filter: FilterQuery<DefectiveGoods>,
		page: number,
		limit: number
	): Promise<Pagination<DefectiveGoodsDocument>>
	findManyForWrite(filter: FilterQuery<DefectiveGoods>): Promise<DefectiveGoodsDocument[]>
	updateById(id: string, data: IDefectiveGoods): Promise<DefectiveGoodsDocument | null>
	softDeleteById(id: string): Promise<DefectiveGoodsDocument | null>
	softDeleteMany(filter: FilterQuery<DefectiveGoods>): Promise<DefectiveGoodsDocument[]>
}
