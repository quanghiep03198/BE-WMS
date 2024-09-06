import { Databases } from '@/common/constants/global.enum'
import { BaseAbstractEntity } from '@/modules/_base/base.abstract.entity'
import 'dotenv/config'
import { Column, Entity, Index } from 'typeorm'

@Entity('ts_user', { database: Databases.SYSCLOUD })
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

	@Column({ type: 'bit', default: 0 })
	isadmin: boolean

	authenticate(password: string) {
		return this.password === password
	}

	constructor(user: Partial<UserEntity>) {
		super()
		Object.assign(this, user)
	}
}
