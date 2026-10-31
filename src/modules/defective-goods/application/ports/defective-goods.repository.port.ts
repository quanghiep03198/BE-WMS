import { IBaseRepository } from '@modules/_base/interfaces/base.abstract.repository.interface'
import { IDefectiveGoods } from '@modules/defective-goods/domain/interfaces'
import { DefectiveGoodsDomainModel } from '@modules/defective-goods/domain/models/defective-goods.model'
import { DeleteManyDefectiveGoodsDTO } from '../dto/defective-goods.dto'

export const DEFECTIVE_GOODS_REPOSITORY = Symbol('DEFECTIVE_GOODS_REPOSITORY')

export interface IDefectiveGoodsRepository extends IBaseRepository<IDefectiveGoods, string | TObjectId> {
	create(payload: DefectiveGoodsDomainModel[]): Promise<DefectiveGoodsDomainModel[]>
	find(
		filter?: Partial<IDefectiveGoods> | Record<string, any>,
		projection?: Nullish<Record<string, any> | string>,
		options?: Partial<{ read: 'primary' | 'secondary'; limit: number; skip: number; sort: any }>
	): Promise<DefectiveGoodsDomainModel[]>
	findOne(filter?: Partial<IDefectiveGoods> | Record<string, any>): Promise<IDefectiveGoods>
	findById(id: string | TObjectId): Promise<DefectiveGoodsDomainModel>
	updateById(id: string | TObjectId, payload: DefectiveGoodsDomainModel): Promise<DefectiveGoodsDomainModel>
	getInoutboundEpcs(
		stockFlow: 'inbound' | 'outbound',
		filters?: Partial<IDefectiveGoods> | Record<string, any>,
		take?: number
	): Promise<Pick<Pagination<IDefectiveGoods>, 'data' | 'totalDocs'>>
	getScanningSizeQty(epcs: string[]): Promise<
		{
			factory_shoes_style: string
			color_sn: string
			sizes: {
				size_code: string
				qty: number
			}[]
		}[]
	>
	stockIn(models: DefectiveGoodsDomainModel[]): Promise<void>
	stockOut(models: DefectiveGoodsDomainModel[]): Promise<void>
	deleteMany(filter: DeleteManyDefectiveGoodsDTO): Promise<DefectiveGoodsDomainModel[]>
	// deleteMany(filter?: Partial<IDefectiveGoods> | Record<string, any>): Promise<void>
}
