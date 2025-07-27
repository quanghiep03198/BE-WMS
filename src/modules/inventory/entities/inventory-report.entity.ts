import { DATABASE_DATA_LAKE, DATABASE_SCHEMA } from '@/databases/constants'
import { BaseAbstractEntity } from '@/modules/_base/base.abstract.entity'
import { Column, Entity } from 'typeorm'
import { InventoryType } from '../constants'

@Entity({
	database: DATABASE_DATA_LAKE,
	schema: DATABASE_SCHEMA,
	name: 'dv_invprodmst',
	synchronize: false
})
export class InventoryReportEntity extends BaseAbstractEntity {
	@Column({ name: 'inv_type', enum: InventoryType, type: 'nvarchar', length: 10 })
	inv_type: InventoryType

	@Column({ name: 'cofactory_code', type: 'nvarchar', length: 20 })
	factory_code: string

	@Column({ name: 'inv_yearmonth', type: 'nvarchar', length: 20 })
	inv_year_month: string

	@Column({ name: 'custbrand_id', type: 'nvarchar', length: 100 })
	cust_brand_id: string

	@Column({ name: 'shoestyle_cofactory', type: 'nvarchar', length: 100 })
	factory_shoes_style: string

	@Column({ name: 'cust_shoestyle', type: 'nvarchar', length: 50 })
	cust_shoes_style: string

	@Column({ name: 'po', type: 'nvarchar', length: 50 })
	po: string

	@Column({ name: 'mo_no', type: 'nvarchar', length: 20 })
	mo_no: string

	@Column({ name: 'mo_no_seq', type: 'nvarchar', length: 20 })
	mo_no_seq: string

	@Column({ name: 'or_no', type: 'nvarchar', length: 50 })
	or_no: string

	@Column({ name: 'size_numcode', type: 'nvarchar', length: 20 })
	size_numcode: string

	@Column({ name: 'mo_qty', type: 'numeric', precision: 16, scale: 4 })
	mo_qty: number

	@Column({ name: 'inv_initialqty', type: 'numeric', precision: 16, scale: 4 })
	initial_stock_qty: number

	@Column({ name: 'inv_istotalqty', type: 'numeric', precision: 16, scale: 4 })
	instock_qty: number

	@Column({ name: 'inv_ostotalqty', type: 'numeric', precision: 16, scale: 4 })
	outstock_qty: number

	@Column({ name: 'inv_manualqty', type: 'numeric', precision: 16, scale: 4 })
	actual_instock_qty: number

	@Column({ name: 'inv_manualqtyout', type: 'numeric', precision: 16, scale: 4 })
	actual_outstock_qty: number

	@Column({ name: 'inv_finalqty', type: 'numeric', precision: 16, scale: 4 })
	final_stock_qty: number

	constructor(warehouse: Partial<InventoryReportEntity>) {
		super()
		Object.assign(this, warehouse)
	}
}
