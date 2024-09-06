import { DATABASE_DATA_LAKE } from '@/databases/constants'
import { BaseAbstractEntity } from '@/modules/_base/base.abstract.entity'
import { Column, Entity } from 'typeorm'
import { InventoryStorageType, RFIDActions } from '../constants'

@Entity('dv_InvRFIDrecorddet', { database: DATABASE_DATA_LAKE })
export class RFIDInventoryEntity extends BaseAbstractEntity {
	@Column({ type: 'nvarchar', length: 20, enum: RFIDActions, default: null })
	rfid_status: string

	@Column({ type: 'nvarchar', length: 20, enum: InventoryStorageType, default: null })
	rfid_use: InventoryStorageType

	@Column({ type: 'varchar', length: 20 })
	mo_no: string

	@Column({ name: 'EPC_Code' })
	epc: string

	@Column({ type: 'datetime' })
	record_time: Date

	@Column()
	storage: string

	@Column({ type: 'numeric', default: 0 })
	quantity: number

	@Column()
	dept_code: string

	constructor(item: Partial<RFIDInventoryEntity>) {
		super()
		Object.assign(this, item)
	}
}
