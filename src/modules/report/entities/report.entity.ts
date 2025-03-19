import { DATABASE_DATA_LAKE } from '@/databases/constants'
import { BaseAbstractEntity } from '@/modules/_base/base.abstract.entity'
import { Column, Entity } from 'typeorm'

@Entity({ database: DATABASE_DATA_LAKE, schema: 'dbo', name: 'dv_invprodmst', synchronize: false })
export class InventoryReportyEntity extends BaseAbstractEntity {
	@Column({ name: 'inv_yearmonth', type: 'nvarchar', length: 20 })
	inv_year_month: string

	@Column({ name: 'custbrand_id', type: 'nvarchar', length: 100 })
	cust_brand_id: string

	@Column({ name: 'shoestyle_cofactory', type: 'nvarchar', length: 100 })
	shoestyle_cofactory: string

	@Column({ name: 'cust_shoestyle', type: 'nvarchar', length: 50 })
	cust_shoestyle: string

	@Column({ name: 'mo_no', type: 'nvarchar', length: 20 })
	mo_no: string

	@Column({ name: 'mo_no', type: 'nvarchar', length: 20 })
	mo_no_seq: string

	@Column({ name: 'po', type: 'nvarchar', length: 50 })
	po: string

	@Column({ name: 'po', type: 'nvarchar', length: 50 })
	or_no: string

	@Column({ name: 'size_numcode', type: 'nvarchar', length: 20 })
	size_numcode: string

	@Column({ name: 'inv_initialqty', type: 'numeric', precision: 16, scale: 4 })
	init_qty: string

	@Column({ name: 'inbound_qty', type: 'numeric', precision: 16, scale: 4 })
	inv_istotalqty: string

	@Column({ name: 'outbound_qty', type: 'numeric', precision: 16, scale: 4 })
	inv_ostotalqty: string

	@Column({ name: 'inv_finalqty', type: 'numeric', precision: 16, scale: 4 })
	in_stock_qty: string
}
