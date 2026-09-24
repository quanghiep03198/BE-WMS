import { IUser } from '@modules/user/domain/interfaces'

export interface IStorageLocation {
	_id: string | TObjectId
	name: string
	warehouse: TObjectId
	created_at: Date
	updated_at?: Date
	created_by: TObjectId | Partial<IUser>
	updated_by?: TObjectId | Partial<IUser>
}
