import { RecordStatus } from '@/common/constants/global.enum'
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

@Entity()
export abstract class BaseAbstractEntity {
	@PrimaryGeneratedColumn({ type: 'int' })
	keyid: number

	@Column({ type: 'nvarchar', length: 50, default: null })
	user_code_created: string

	@Column({ type: 'nvarchar', length: 50, default: null })
	user_code_updated: string

	@CreateDateColumn({ type: 'datetime' })
	created: Date

	@UpdateDateColumn({ type: 'datetime' })
	updated: Date

	@Column({ type: 'varchar', length: 1, enum: RecordStatus, default: RecordStatus.ACTIVE })
	isactive: RecordStatus

	@Column({ type: 'nvarchar', length: 255, default: null })
	remark: string
}
