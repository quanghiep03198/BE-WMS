import { StringToBoolTransformer } from '@/databases/transformers/bool.transformer'
import { format } from 'date-fns'
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, TableColumnOptions, UpdateDateColumn } from 'typeorm'
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

	@Column({
		name: 'isactive',
		type: 'varchar',
		length: 1,
		enum: RecordStatus,
		default: RecordStatus.ACTIVE,
		transformer: new StringToBoolTransformer()
	})
	is_active: boolean

	@Column({ type: 'nvarchar', length: 255, nullable: true })
	remark: string | null

	public static readonly BASE_COLUMNS: TableColumnOptions[] = [
		{ name: 'keyid', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
		{ name: 'user_code_created', type: 'nvarchar', length: '50', isNullable: true },
		{ name: 'user_name_created', type: 'nvarchar', length: '50', isNullable: true },
		{ name: 'user_code_updated', type: 'nvarchar', length: '50', isNullable: true },
		{ name: 'user_name_updated', type: 'nvarchar', length: '50', isNullable: true },
		{ name: 'created', type: 'datetime', default: 'CURRENT_TIMESTAMP', isNullable: true },
		{ name: 'updated', type: 'datetime', isNullable: true, onUpdate: 'CURRENT_TIMESTAMP' },
		{ name: 'isactive', type: 'varchar', length: '1', isNullable: false, default: "'Y'" },
		{ name: 'remark', type: 'nvarchar', length: '255', isNullable: true }
	]
}
