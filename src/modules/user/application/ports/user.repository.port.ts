import { IBaseRepository } from '@modules/_base/interfaces/base.abstract.repository.interface'
import { IUser } from '../../domain/interfaces'

export interface IUserRepository extends IBaseRepository<IUser, TObjectId | string> {
	updateOneById(id: TObjectId | string, payload: Partial<IUser>): Promise<IUser>
	findOrCreate(payload: { username: string; password: string }): Promise<IUser>
	updatePassword(id: TObjectId, newPassword: string): Promise<IUser>
}

export const USER_REPOSITORY = Symbol('IUserRepository')
