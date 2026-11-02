import { UnflatedFilterQueryDTO } from '../dto/truckload-delivery.dto'

export const TRUCKLOAD_DELIVERY_CACHE_REPOSITORY = 'TRUCKLOAD_DELIVERY_CACHE_REPOSITORY'

export interface ITruckloadDeliveryCacheRepository {
	setCount(filter: Partial<UnflatedFilterQueryDTO['where']>, count: number): Promise<number>
	getCount(filter: Partial<UnflatedFilterQueryDTO['where']>): Promise<number>
}
