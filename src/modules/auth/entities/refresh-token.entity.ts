import { DATABASE_SCHEMA, DATABASE_SYSCLOUD } from '@/databases/constants'
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

@Entity({
	database: DATABASE_SYSCLOUD,
	schema: DATABASE_SCHEMA,
	name: 'ts_refresh_tokens'
})
export class RefreshTokenEntity {
	@PrimaryGeneratedColumn({ name: 'id', type: 'int' })
	id: number

	@Column({ name: 'token_hash', type: 'nvarchar', length: 'max', nullable: false, comment: 'Opaque hashed token' })
	token_hash: string

	@Column({ name: 'username', type: 'nvarchar', length: 50, nullable: false })
	username: string

	@Column({ name: 'expires_at', type: 'datetime', nullable: false })
	expires_at: Date

	@Column({ name: 'revoked_at', type: 'datetime', nullable: true })
	revoked_at: Date | null
}
