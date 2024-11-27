import { DATABASE_DATA_LAKE } from '@/databases/constants'
import { BaseAbstractEntity } from '@/modules/_base/base.abstract.entity'
import { Column, Entity } from 'typeorm'

console.log('NODE_ENV:', process.env.NODE_ENV)

@Entity('dv_transferordermst', { database: DATABASE_DATA_LAKE })
export class TransferOrderEntity extends BaseAbstractEntity {
	@Column({ type: 'nvarchar', length: 10 })
	cofactory_code: string

	@Column({ type: 'nvarchar', length: 50 })
	custbrand_id: string

	@Column({ type: 'nvarchar', length: 50 })
	brand_name: string

	@Column({ type: 'nvarchar', length: 50 })
	transfer_order_code: string

	@Column({ type: 'nvarchar', length: 20 })
	kg_no: string

	@Column({ type: 'nvarchar', length: 20 })
	mo_no: string

	@Column({ type: 'nvarchar', length: 20 })
	or_no: string

	@Column({ type: 'nvarchar', length: 20 })
	or_custpo: string

	@Column({ type: 'nvarchar', length: 20 })
	shoestyle_codefactory: string

	@Column({ type: 'nvarchar', length: 20 })
	or_warehouse: string

	@Column({ type: 'nvarchar', length: 20 })
	or_location: string

	@Column({ type: 'nvarchar', length: 20 })
	al_warehouse: string

	@Column({ type: 'nvarchar', length: 20 })
	new_warehouse: string

	@Column({ type: 'nvarchar', length: 20 })
	new_location: string

	@Column({ type: 'nvarchar', length: 20 })
	new_al_warehouse: string

	@Column({ type: 'nvarchar', length: 10 })
	status_approve: string

	@Column({ type: 'nvarchar', length: 20 })
	employee_name_approve: string

	@Column({ type: 'nvarchar', length: 20 })
	approve_date: string
}
