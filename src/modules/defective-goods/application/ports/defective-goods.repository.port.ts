import { TRequestUser } from '@common/decorators'
import { IBaseRepository } from '@modules/_base/interfaces/base.abstract.repository.interface'
import { IDefectiveGoods } from '@modules/defective-goods/domain/interfaces'
import { UpdateInboundStatusDTO, UpdateOutboundStatusDTO } from '../dto/inoutbound.dto'

export const DEFECTIVE_GOODS_REPOSITORY = Symbol('DEFECTIVE_GOODS_REPOSITORY')

export interface IDefectiveGoodsRepository extends IBaseRepository<IDefectiveGoods, string | TObjectId> {
	/**
	 * @override
	 * @param filter
	 */
	findAll(filter?: Partial<IDefectiveGoods> | Record<string, any>): Promise<IDefectiveGoods[]>
	/**
	 * @override
	 * @param filter
	 */
	findOne(filter?: Partial<IDefectiveGoods> | Record<string, any>): Promise<IDefectiveGoods>
	getInoutboundEpcs(
		stockFlow: 'inbound' | 'outbound',
		filters?: Partial<IDefectiveGoods> | Record<string, any>
	): Promise<IDefectiveGoods[]>
	stockIn(payload: UpdateInboundStatusDTO, user: TRequestUser): Promise<IDefectiveGoods[]>
	stockOut(payload: UpdateOutboundStatusDTO, user: TRequestUser): Promise<IDefectiveGoods[]>
	// findById(id: string): Promise<IDefectiveGoods | null>
	// findOne(filter: FilterQuery<DefectiveGoods>): Promise<IDefectiveGoods | null>
	// findOneForWrite(filter: FilterQuery<DefectiveGoods>): Promise<IDefectiveGoods | null>
	// findManyForWrite(filter: FilterQuery<DefectiveGoods>): Promise<IDefectiveGoods[]>
	// updateById(id: string, data: IDefectiveGoods): Promise<IDefectiveGoods | null>
	// softDeleteById(id: string): Promise<IDefectiveGoods | null>
	// softDeleteMany(filter: FilterQuery<DefectiveGoods>): Promise<IDefectiveGoods[]>
}
