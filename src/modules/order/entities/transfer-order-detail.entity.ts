import { DATABASE_DATA_LAKE } from '@/databases/constants'
import { BaseAbstractEntity } from '@/modules/_base/base.abstract.entity'
import { Column, Entity } from 'typeorm'

@Entity('dv_transferorderdet', { database: DATABASE_DATA_LAKE })
export class TransferOrderDetailEntity extends BaseAbstractEntity {
	@Column({ type: 'nvarchar', length: 50 })
	transfer_order_code: string

	@Column({ type: 'nvarchar', length: 20, nullable: true })
	seqno: string

	@Column({ type: 'nvarchar', length: 20 })
	or_no: string

	@Column({ type: 'nvarchar', length: 20, default: 0 })
	trans_num: number

	@Column({ type: 'int', default: 0 })
	sno_qty: number

	@Column({ type: 'int', default: 0 })
	or_qtyperpacking: number

	@Column({ type: 'int', default: 0 })
	kg_nostart: number

	@Column({ type: 'int', default: 0 })
	kg_noend: number

	// common columns that should be defined for an order
}
