import { DATABASE_DATA_LAKE } from '@/databases/constants'
import { BaseAbstractEntity } from '@/modules/_base/base.abstract.entity'
import { Column, Entity, Index } from 'typeorm'
import { InventoryActions, InventoryStorageType } from '../constants'

/**
 * @description RFID Production Management Entity - Describes status of RFID tags in the factory (3034xxx)
 */
@Entity('dv_InvRFIDrecorddet', { database: DATABASE_DATA_LAKE })
export class FPInventoryEntity extends BaseAbstractEntity {
	@Column({ name: 'stationNO' })
	station_no: string

	@Column({ name: 'FC_server_code' })
	factory_code: string

	@Column({ type: 'nvarchar', length: 20 })
	dept_code: string

	@Index()
	@Column({ name: 'EPC_Code' })
	epc: string

	@Index()
	@Column({ type: 'nvarchar', length: 20 })
	mo_no: string

	@Index()
	@Column({ name: 'mo_no_actual', type: 'nvarchar', length: 20, nullable: true })
	mo_no_actual: string

	@Index()
	@Column({ type: 'nvarchar', length: 20, enum: InventoryActions, default: null })
	rfid_status: string

	@Column({ type: 'nvarchar', length: 20, enum: InventoryStorageType, default: null })
	rfid_use: InventoryStorageType

	@Column({ type: 'datetime' })
	record_time: Date | string

	@Column({ type: 'nvarchar', length: 20 })
	storage: string

	@Column({ type: 'numeric', default: 0 })
	quantity: number

	constructor(item: Partial<FPInventoryEntity>) {
		super()
		Object.assign(this, item)
	}
}
