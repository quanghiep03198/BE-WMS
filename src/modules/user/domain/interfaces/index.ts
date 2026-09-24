/* eslint-disable @typescript-eslint/no-empty-object-type */
import { UserRole } from '../constants'

export interface IUser {
	_id: string | TObjectId
	username: string
	password?: string
	display_name: string
	email?: string
	avatar?: string
	roles: Array<UserRole>
	is_system_user: boolean
	is_active?: boolean
	created_by?: unknown
	updated_by?: unknown
	user_code_updated?: string
	user_name_updated?: string
	authenticate(password: string): boolean
}
