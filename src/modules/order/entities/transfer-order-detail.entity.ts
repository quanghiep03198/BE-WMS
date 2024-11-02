import { DATABASE_DATA_LAKE } from '@/databases/constants'
import { BaseAbstractEntity } from '@/modules/_base/base.abstract.entity'
import { Column, Entity } from 'typeorm'

@Entity('dv_transferorderdet', { database: DATABASE_DATA_LAKE, synchronize: false })
export class TransferOrderDetailEntity extends BaseAbstractEntity {
	@Column()
	transfer_order_code: string

	@Column()
	seqno: string

	@Column()
	or_no: string

	@Column()
	trans_num: string

	@Column()
	sno_qty: number

	@Column()
	or_qtyperpacking: string

	@Column()
	kg_nostart: string

	@Column()
	kg_noend: string

	// common columns that should be defined for an order
}
