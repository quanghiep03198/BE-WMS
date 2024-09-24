import { DATABASE_DATA_LAKE } from '@/databases/constants'
import { BaseAbstractEntity } from '@/modules/_base/base.abstract.entity'
import { Column, Entity } from 'typeorm'
import { InventoryActions, InventoryStorageType } from '../constants'

@Entity('dv_InvRFIDrecorddet', { database: DATABASE_DATA_LAKE })
export class RFIDInventoryEntity extends BaseAbstractEntity {
	@Column({ name: 'stationNO' })
	station_no: string

	@Column({ name: 'FC_server_code' })
	factory_code: string

	@Column({ type: 'nvarchar', length: 20 })
	dept_code: string

	@Column({ name: 'EPC_Code' })
	epc: string

	@Column()
	mo_no: string

	@Column()
	mo_no_actual: string

	@Column({ type: 'nvarchar', length: 20, enum: InventoryActions, default: null })
	rfid_status: string

	@Column({ type: 'nvarchar', length: 20, enum: InventoryStorageType, default: null })
	rfid_use: InventoryStorageType

	@Column({ type: 'datetime' })
	record_time: Date | string

	@Column()
	storage: string

	@Column({ type: 'numeric', default: 0 })
	quantity: number

	constructor(item: Partial<RFIDInventoryEntity>) {
		super()
		Object.assign(this, item)
	}
}
