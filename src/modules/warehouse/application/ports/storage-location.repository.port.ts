import { IBaseRepository } from '@modules/_base/interfaces/base.abstract.repository.interface'
import { IStorageLocation } from '@modules/warehouse/domain/interfaces/storage-location.interface'
import { CreateBulkStorageLocationDTO, UpdateStorageLocationDTO } from '../dto/storage-location.dto'

export interface IStorageLocationRepository extends IBaseRepository<IStorageLocation, string | TObjectId> {
	createMany(payload: CreateBulkStorageLocationDTO, createdBy: TObjectId): Promise<IStorageLocation[]>
	findOneAndUpdate(
		id: TObjectId,
		payload: UpdateStorageLocationDTO
	): Promise<{ prev: { name: string }; update: { name: string } }>
	deleteMany(ids: Array<string> | Array<TObjectId>): Promise<string[]>
}

export const STORAGE_LOCATION_REPOSITORY = 'IStorageLocationRepository'
