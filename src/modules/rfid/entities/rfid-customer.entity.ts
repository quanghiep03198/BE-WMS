import { DATABASE_DATA_LAKE } from '@/databases/constants'
import { BaseAbstractEntity } from '@/modules/_base/base.abstract.entity'
import { Column, Entity, Index } from 'typeorm'

@Entity('dv_rfidmatchmst_cust', { database: DATABASE_DATA_LAKE, synchronize: false })
export class RFIDCustomerEntity extends BaseAbstractEntity {
	@Column({ name: 'EPC_Code' })
	@Index()
	epc: string

	@Column({ type: 'nvarchar', length: 20, nullable: true })
	or_no: string

	@Column({ type: 'nvarchar', length: 50, nullable: true })
	or_cust_po: string

	@Column({ type: 'nvarchar', length: 20 })
	@Index()
	mo_no: string

	@Column({ name: 'mo_no_actual', type: 'nvarchar', length: 20, nullable: true })
	@Index()
	mo_no_actual: string

	@Column({ type: 'nvarchar', length: 20, nullable: true })
	mo_noseq: string

	@Column({ type: 'nvarchar', length: 20 })
	size_code: string

	@Column({ type: 'nvarchar', length: 20 })
	@Index()
	size_numcode: string

	@Column({ type: 'numeric' })
	size_qty: string

	@Column({ type: 'nvarchar', length: 20 })
	@Index()
	mat_code: string

	@Column({ name: 'cust_shoestyle', type: 'nvarchar', length: 100 })
	cust_shoes_style: string

	@Column({ name: 'shoestyle_codefactory', length: 20 })
	@Index()
	shoes_style_code_factory: string

	@Column({ type: 'nvarchar', length: 10 })
	ri_type: string

	@Column({ type: 'nvarchar', length: 10 })
	ri_foot: string

	@Column({ type: 'datetime' })
	ri_date: Date

	@Column({ type: 'bit', default: false })
	ri_cancel: boolean

	@Column({ type: 'ntext', nullable: true })
	ri_reason_cancel: string

	@Column({ type: 'date', nullable: true })
	ri_cancel_date: Date

	@Column({ type: 'nvarchar', length: 20 })
	factory_code_orders: string

	@Column({ type: 'nvarchar', length: 50 })
	factory_name_orders: string

	@Column({ type: 'nvarchar', length: 20 })
	factory_code_produce: string

	@Column({ type: 'nvarchar', length: 50 })
	factory_name_produce: string

	@Column({ type: 'nvarchar', length: 20, nullable: true })
	dept_code: string

	@Column({ type: 'nvarchar', length: 50, nullable: true })
	dept_name: string

	constructor(item: Partial<RFIDCustomerEntity>) {
		super()
		Object.assign(this, item)
	}
}
