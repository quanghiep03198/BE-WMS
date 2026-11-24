import { DefectiveGoodsStockedInEvent, DefectiveGoodsStockedOutEvent } from '../../domain/events/defective-goods.events'
import { DefectiveGoodsDomainModel } from '../../domain/models/defective-goods.model'

export const DEFECTIVE_GOODS_STOCK_UNIT_OF_WORK = Symbol('DEFECTIVE_GOODS_STOCK_UNIT_OF_WORK')

export interface IDefectiveGoodsStockTransaction {
	stockIn(models: DefectiveGoodsDomainModel[]): Promise<void>
	stockOut(models: DefectiveGoodsDomainModel[]): Promise<void>
	mergeStockEvents(events: Array<DefectiveGoodsStockedInEvent | DefectiveGoodsStockedOutEvent>): Promise<void>
}

export interface IDefectiveGoodsStockUnitOfWork {
	execute<T>(work: (transaction: IDefectiveGoodsStockTransaction) => Promise<T>): Promise<T>
}
