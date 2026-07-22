import { TManufacturingOrder } from './types'

export interface IOrderRepository {
	getManufacturingOrder(targetMo: string, moSeq?: string): Promise<TManufacturingOrder>
}
