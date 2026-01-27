import { env } from '@/common/utils'
import { DATABASE_SCHEMA, DATABASE_SYSCLOUD } from '@/databases/constants'
import { BoolBitTransformer } from '@/databases/transformers/bool.transformer'
import { JsonParserTransformer } from '@/databases/transformers/json-parser.transformer'
import { BaseAbstractEntity } from '@/modules/_base/base.abstract.entity'
import { FactoryCode } from '@/modules/department/constants'
import { compareSync, hashSync } from 'bcrypt'
import { Column, Entity } from 'typeorm'
import { UserRole } from '../constants'

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

	@Column({ name: 'password_changed_at', type: 'datetime', nullable: true })
	password_changed_at: Date | null

	@Column({ name: 'last_login_at', type: 'datetime', nullable: true })
	last_login_at: Date | null

	@Column({ name: 'password_reset_required', type: 'bit', default: false, transformer: new BoolBitTransformer() })
	password_reset_required: boolean

	// * Access control
	@Column({
		name: 'roles',
		type: 'nvarchar',
		length: 255,
		nullable: false,
		transformer: new JsonParserTransformer(1),
		comment: 'User roles defining access levels and permissions'
	})
	roles: UserRole[]

	@Column({
		name: 'authorized_factory_codes',
		type: 'nvarchar',
		length: 255,
		nullable: true,
		transformer: new JsonParserTransformer(1),
		comment: 'Comma-separated factory codes that the user is authorized to access'
	})
	authorized_factory_codes: Array<FactoryCode> | null

	constructor(user?: Partial<UserEntity>) {
		super()
		Object.assign(this, user)
	}

	authenticate(password: string) {
		return compareSync(password, this.password)
	}

	encryptPassword() {
		console.log(this.password)
		this.password = hashSync(this.password, env('SALT_ROUND', { fallbackValue: 10, serialize: Number.parseInt }))
	}
}
