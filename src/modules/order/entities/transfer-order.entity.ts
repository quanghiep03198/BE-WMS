import { DATABASE_DATA_LAKE } from '@/databases/constants'
import { BaseAbstractEntity } from '@/modules/_base/base.abstract.entity'
import { Column, Entity } from 'typeorm'

@Entity('dv_transferordermst', { database: DATABASE_DATA_LAKE, synchronize: false })
export class TransferOrderEntity extends BaseAbstractEntity {
	@Column()
	cofactory_code: string

	@Column()
	custbrand_id: string

	@Column()
	brand_name: string

	@Column()
	transfer_order_code: string

	@Column()
	kg_no: string

	@Column()
	mo_no: string

	@Column()
	or_no: string

	@Column()
	or_custpo: string

	@Column()
	shoestyle_codefactory: string

	@Column()
	or_warehouse: string

	@Column()
	or_location: string

	@Column()
	al_warehouse: string

	@Column()
	new_warehouse: string

	@Column()
	new_location: string

	@Column()
	new_al_warehouse: string

	@Column()
	status_approve: string

	@Column()
	employee_name_approve: string

	@Column()
	approve_date: string
}
