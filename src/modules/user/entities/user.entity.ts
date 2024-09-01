import { compareSync, genSaltSync, hashSync } from 'bcrypt'
import 'dotenv/config'
import {
	BeforeInsert,
	Column,
	CreateDateColumn,
	Entity,
	Index,
	PrimaryGeneratedColumn,
	UpdateDateColumn
} from 'typeorm'

@Entity('users')
export class UserEntity {
	@PrimaryGeneratedColumn()
	id: number

	@Index({ unique: true })
	@Column({ length: 50 })
	username: string

	@Column({ length: 100 })
	password: string

	@Column({ length: 100 })
	display_name: string

	@CreateDateColumn({ type: 'datetime' })
	created_at: Date

	@UpdateDateColumn({ type: 'datetime' })
	updated_at: Date

	@BeforeInsert()
	hashPassword() {
		console.log(this.password)
		this.password = hashSync(this.password, genSaltSync(+process.env.SALT_ROUND))
	}

	authenticate(password: string) {
		return compareSync(password, this.password)
	}

	constructor(user: Partial<UserEntity>) {
		Object.assign(this, user)
	}
}
