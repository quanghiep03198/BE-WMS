import { DATABASE_DATA_LAKE, DATABASE_SCHEMA } from '@/databases/constants'
import { BaseAbstractEntity } from '@/modules/_base/base.abstract.entity'
import { Column, Entity } from 'typeorm'
import { UserRole } from '../constants'

@Entity({ database: DATABASE_DATA_LAKE, schema: DATABASE_SCHEMA, name: 'ts_users' })
export class UserEntity extends BaseAbstractEntity {
	@Column({ name: 'username', type: 'nvarchar', length: 50, unique: true })
	username: string

	@Column({ name: 'password', type: 'nvarchar', length: 255 })
	password: string

	@Column({ name: 'email', type: 'nvarchar', length: 100, unique: true, nullable: true })
	email: string | null

	@Column({ name: 'display_name', type: 'nvarchar', length: 100, nullable: false })
	display_name: string

	@Column({ name: 'employee_code', type: 'nvarchar', length: 100, nullable: true })
	employee_code: string | null

	// * Access control
	@Column({
		name: 'role',
		type: 'nvarchar',
		length: 50,
		nullable: false,
		enum: UserRole,
		enumName: 'CHK_ts_users_role'
	})
	role: UserRole

	@Column({
		name: 'authorized_factory_codes',
		type: 'nvarchar',
		length: 255,
		nullable: true,
		comment: 'Comma-separated factory codes that the user is authorized to access'
	})
	authorized_factory_codes: string | null

	constructor(user?: Partial<UserEntity>) {
		super()
		Object.assign(this, user)
	}
}
