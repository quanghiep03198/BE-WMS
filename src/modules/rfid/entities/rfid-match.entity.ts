import { DATABASE_DATA_LAKE } from '@/databases/constants'
import { BoolBitTransformer } from '@/databases/transformers/bool.transformer'
import { BaseAbstractEntity } from '@/modules/_base/base.abstract.entity'
import { Column, Entity } from 'typeorm'

/**
 * @description RFID Production Management Entity - Describes the details of internal EPC (which commonly starts with E28xxx)
 */
@Entity('dv_rfidmatchmst', { database: DATABASE_DATA_LAKE, synchronize: false })
export class RFIDMatchEntity extends BaseAbstractEntity {
	@Column({ name: 'EPC_Code', type: 'nvarchar', length: 50 })
	epc: string

	@Column({ type: 'nvarchar', length: 20 })
	mo_no: string

	@Column({ type: 'nvarchar', length: 20 })
	size_numcode: string

	@Column({ type: 'nvarchar', length: 20 })
	mat_code: string

	@Column({ type: 'nvarchar', length: 20 })
	shoestyle_codefactory: string

	@Column({ type: 'bit', default: false, transformer: new BoolBitTransformer() })
	ri_cancel: boolean

	@Column({ type: 'nvarchar', length: 10, enum: ['A', 'B', 'C', 'D'] })
	sole_tag: string

	constructor(item: Partial<RFIDMatchEntity>) {
		super()
		Object.assign(this, item)
	}
}
