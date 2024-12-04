import { DATABASE_DATA_LAKE } from '@/databases/constants'
import { BaseAbstractEntity } from '@/modules/_base/base.abstract.entity'
import { Column, Entity } from 'typeorm'
import { InventoryActions } from '../constants'

/**
 * @deprecated
 * @description RFID Production Management Entity - Describes status of Internal RFID tags in the factory (E28xxx)
 */
@Entity('dv_InvRFIDrecordmst', { database: DATABASE_DATA_LAKE })
export class PMInventoryEntity extends BaseAbstractEntity {
	@Column({ name: 'stationNO', type: 'nvarchar', length: 20 })
	station_no: string

	@Column({ name: 'record_time', type: 'datetime' })
	record_time: Date | string

	@Column({ name: 'mo_no', type: 'nvarchar', length: 20 })
	mo_no: string

	@Column({ name: 'EPC_Code', type: 'nvarchar', length: 50 })
	epc: string

	@Column({ name: 'FC_server_code', type: 'nvarchar', length: 10 })
	server_code: string

	@Column({ type: 'nvarchar', length: 10 })
	rfid_status: InventoryActions & string

	@Column({ type: 'nvarchar', length: 10 })
	inoutbound_type: string

	@Column({ type: 'nvarchar', length: 10 })
	type_storage: string
}
