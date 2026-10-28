import { TRequestUser } from '@common/decorators'
import { IBaseRepository } from '@modules/_base/interfaces/base.abstract.repository.interface'
import { IDefectiveGoods } from '@modules/defective-goods/domain/interfaces'
import { DeleteManyDefectiveGoodsDTO } from '../dto/defective-goods.dto'
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
	stockIn(payload: UpdateInboundStatusDTO, user: TRequestUser): Promise<IDefectiveGoods[]>
	stockOut(payload: UpdateOutboundStatusDTO, user: TRequestUser): Promise<IDefectiveGoods[]>
	deleteMany(filter: DeleteManyDefectiveGoodsDTO): Promise<string[]>
	// deleteMany(filter?: Partial<IDefectiveGoods> | Record<string, any>): Promise<void>
}
