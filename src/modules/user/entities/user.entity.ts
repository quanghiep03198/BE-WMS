import { DATABASE_SYSCLOUD } from '@/databases/constants'
import { BaseAbstractEntity } from '@/modules/_base/base.abstract.entity'
import { UserRoles } from '@/modules/user/constants'
import 'dotenv/config'
import { Column, Entity, Index } from 'typeorm'

@Entity('ts_user', { database: DATABASE_SYSCLOUD })
export class UserEntity extends BaseAbstractEntity {
	@Index({ unique: true })
	@Column({ name: 'user_code', type: 'nvarchar', length: 20 })
	username: string

	@Column({ name: 'user_password', length: 20 })
	password: string

	@Index({ unique: true })
	@Column({ type: 'nvarchar', length: 20 })
	employee_code: string

	@Column()
	remember_token: string

	@Column({ name: 'isadmin', type: 'bit', default: 0 })
	is_admin: boolean

	@Column({ type: 'nvarchar', length: 20, enum: UserRoles, default: UserRoles.USER })
	role: UserRoles

	authenticate(password: string) {
		return this.password === password
	}

	constructor(user: Partial<UserEntity>) {
		super()
		Object.assign(this, user)
	}
}
