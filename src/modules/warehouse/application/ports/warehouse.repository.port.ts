import { IBaseRepository } from '@modules/_base/interfaces/base.abstract.repository.interface'
import { IWarehouse } from '@modules/warehouse/domain/interfaces/warehouse.interface'

export interface IWarehouseRepository extends IBaseRepository<IWarehouse, string | TObjectId> {
	findOneAndUpdate(id: TObjectId, payload: Partial<IWarehouse>): Promise<{ prev: IWarehouse; update: IWarehouse }>
	getTotalCapacity(): Promise<{ total_capacity: number; total_storage_locations: number }>
	deleteMany(ids: Array<string> | Array<TObjectId>): Promise<string[]>
}
export const WAREHOUSE_REPOSITORY = Symbol('IWarehouseRepository')
