import { DATABASE_DATA_LAKE, DATABASE_SCHEMA, RecordStatus } from '@/databases/constants'
import { format } from 'date-fns'
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

@Entity('dv_rfidreader', { database: DATABASE_DATA_LAKE, schema: DATABASE_SCHEMA, synchronize: true })
export class RFIDReaderEntity {
	@PrimaryGeneratedColumn({ name: 'id', type: 'int' })
	id: number

	@Column({ name: 'device_sn' })
	device_sn: string

	@Column({ name: 'device_ant' })
	device_ant: string

	@Column({ name: 'device_name' })
	station_no: string

	@Column({ name: 'ip_address' })
	ip_address: string

	@Column({ name: 'ip_port' })
	ip_port: string

	@Column({ name: 'cofactory_code' })
	factory_code: string

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
}
