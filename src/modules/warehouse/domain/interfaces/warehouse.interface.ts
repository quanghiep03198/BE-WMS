import { IUser } from '@modules/user/domain/interfaces'

export interface IWarehouse {
	_id: TObjectId
	name: string
	capacity: number
	created_by: TObjectId | Partial<IUser>
	updated_by?: Nullish<TObjectId | Partial<IUser>>
	created_at: Date
	updated_at?: Date
	storage_locations?: Array<{ name: string; warehouse?: TObjectId | Partial<IWarehouse> }>
}
