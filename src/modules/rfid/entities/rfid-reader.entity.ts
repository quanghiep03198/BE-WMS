import { DATABASE_DATA_LAKE, DATABASE_SCHEMA, RecordStatus } from '@/databases/constants'
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

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

	@Column({ name: 'isactive', type: 'varchar', length: 1, enum: RecordStatus, default: RecordStatus.ACTIVE })
	is_active: RecordStatus
}
