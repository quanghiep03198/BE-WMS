import { DATABASE_DATA_LAKE, DATABASE_SCHEMA } from '@/databases/constants'
import { BaseAbstractEntity } from '@/modules/_base/base.abstract.entity'
import { Column, Entity } from 'typeorm'
import { InventoryActions, InventoryStorageType } from '../../domain/constants'

/**
 * @description RFID Production Management Entity - Describes status of RFID tags in the factory (3034xxx)
 */
@Entity()
export class BaseRFIDInventoryEntity extends BaseAbstractEntity {
	@Column({ name: 'stationNO' })
	station_no: string

	@Column({ name: 'FC_server_code' })
	factory_code: string

	@Column({ name: 'dept_code', type: 'nvarchar', length: 20 })
	dept_code: string

	@Column({ name: 'dept_name', type: 'nvarchar', length: 20 })
	dept_name: string

	@Column({ name: 'EPC_Code' })
	epc: string

	@Column({ name: 'mo_no', type: 'nvarchar', length: 20 })
	mo_no: string

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

	constructor(item: Partial<BaseRFIDInventoryEntity>) {
		super()
		Object.assign(this, item)
	}
}

@Entity('dv_InvRFIDrecorddet', { database: DATABASE_DATA_LAKE, schema: DATABASE_SCHEMA })
export class RFIDInventoryEntity extends BaseRFIDInventoryEntity {}

@Entity('dv_InvRFIDrecorddet_backup_Daily', { database: DATABASE_DATA_LAKE, schema: DATABASE_SCHEMA })
export class RFIDInventoryBackupEntity extends BaseRFIDInventoryEntity {}
