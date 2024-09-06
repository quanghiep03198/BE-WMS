import { Databases } from '@/common/constants/global.enum'
import { Column, Entity } from 'typeorm'
import { InventoryStorageType, RFIDActions } from '../constants/rfid.enum'

@Entity('dv_InvRFIDrecorddet', { database: Databases.DATALAKE })
export class RFIDInventoryEntity {
	@Column({ enum: RFIDActions, default: null })
	rfid_status: string

	@Column({ enum: InventoryStorageType, default: null })
	rfid_use: InventoryStorageType

	@Column()
	mo_no: string

	@Column({ name: 'EPC_Code' })
	epc: string

	@Column()
	record_time: Date

	@Column()
	storage: string

	@Column({ type: 'numeric' })
	quantity: number

	@Column()
	dept_code: string

	constructor(item: Partial<RFIDInventoryEntity>) {
		Object.assign(this, item)
	}
}
