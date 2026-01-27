/* eslint-disable @typescript-eslint/no-empty-object-type */
import { type UserEntity } from './entities/user.entity'

export interface IUser extends Omit<UserEntity, 'authenticate' | 'encryptPassword'> {}
