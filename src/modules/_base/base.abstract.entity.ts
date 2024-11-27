import { format } from 'date-fns'
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { RecordStatus } from '../../databases/constants'

@Entity()
export abstract class BaseAbstractEntity {
	@PrimaryGeneratedColumn({ name: 'keyid', type: 'int' })
	id: number

	@Column({ type: 'nvarchar', length: 50, nullable: true })
	user_code_created: string | null

	@Column({ type: 'nvarchar', length: 50, nullable: true })
	user_name_created: string | null

	@Column({ type: 'nvarchar', length: 50, nullable: true })
	user_code_updated: string | null

	@Column({ type: 'nvarchar', length: 50, nullable: true })
	user_name_updated: string | null

	@CreateDateColumn({ type: 'datetime', default: format(new Date(), 'yyyy-MM-dd HH:mm:ss') })
	created: Date

	@UpdateDateColumn({ type: 'datetime', nullable: true, onUpdate: 'CURRENT_TIMESTAMP' })
	updated: Date

	@Column({ name: 'isactive', type: 'varchar', length: 1, enum: RecordStatus, default: RecordStatus.ACTIVE })
	is_active: RecordStatus

	@Column({ type: 'nvarchar', length: 255, nullable: true })
	remark: string | null
}
