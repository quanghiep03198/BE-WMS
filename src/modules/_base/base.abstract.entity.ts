import { RecordStatus } from '@/databases/constants'
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

@Entity()
export abstract class BaseAbstractEntity {
	@PrimaryGeneratedColumn({ name: 'keyid', type: 'int' })
	id: number

	@Column({ type: 'nvarchar', length: 50, default: null })
	user_code_created: string

	@Column({ type: 'nvarchar', length: 50, default: null })
	user_code_updated: string

	@CreateDateColumn({ type: 'datetime' })
	created: Date

	@UpdateDateColumn({ type: 'datetime' })
	updated: Date

	@Column({ name: 'isactive', type: 'varchar', length: 1, enum: RecordStatus, default: RecordStatus.ACTIVE })
	is_active: RecordStatus

	@Column({ type: 'nvarchar', length: 255, default: null })
	remark: string
}
