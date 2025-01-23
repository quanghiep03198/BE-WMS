import { DATABASE_DATA_LAKE } from '@/databases/constants'
import { Column, Entity } from 'typeorm'

@Entity('dv_rfidreader', { database: DATABASE_DATA_LAKE })
export class RFIDReaderEntity {
	@Column({ name: 'id', primary: true })
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
}
