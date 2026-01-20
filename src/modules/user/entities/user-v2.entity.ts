import { env } from '@/common/utils'
import { DATABASE_SCHEMA, DATABASE_SYSCLOUD } from '@/databases/constants'
import { JsonParserTransformer } from '@/databases/transformers/json-parser.transformer'
import { BaseAbstractEntity } from '@/modules/_base/base.abstract.entity'
import { FactoryCode } from '@/modules/department/constants'
import { compareSync, hashSync } from 'bcrypt'
import { Column, Entity } from 'typeorm'
import { UserRoles } from '../constants'

@Entity({ database: DATABASE_SYSCLOUD, schema: DATABASE_SCHEMA, name: 'ts_users' })
export class UserEntity extends BaseAbstractEntity {
	@Column({ name: 'username', type: 'nvarchar', length: 50, unique: true })
	username: string

	@Column({ name: 'password', type: 'nvarchar', length: 255 })
	password: string

	@Column({ name: 'email', type: 'nvarchar', length: 100, unique: true, nullable: true })
	email: string | null

	@Column({ name: 'display_name', type: 'nvarchar', length: 100, nullable: false })
	display_name: string

	@Column({ name: 'employee_code', type: 'nvarchar', length: 100, unique: true, nullable: true })
	employee_code: string | null

	// * Access control
	@Column({
		name: 'role',
		type: 'nvarchar',
		length: 50,
		nullable: false,
		enum: UserRoles,
		enumName: 'CHK_ts_users_role'
	})
	role: UserRoles

	@Column({
		name: 'authorized_factory_codes',
		type: 'nvarchar',
		length: 255,
		nullable: true,
		transformer: new JsonParserTransformer(1),
		comment: 'Comma-separated factory codes that the user is authorized to access'
	})
	authorized_factory_codes: Array<FactoryCode> | null

	authenticate(password: string) {
		return compareSync(password, this.password)
	}

	encryptPassword() {
		console.log(this.password)
		this.password = hashSync(this.password, env('SALT_ROUND', { fallbackValue: 10, serialize: Number.parseInt }))
	}

	constructor(user?: Partial<UserEntity>) {
		super()
		Object.assign(this, user)
	}
}
