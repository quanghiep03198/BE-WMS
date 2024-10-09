import { DATABASE_DATA_LAKE } from '@/databases/constants'
import { BaseAbstractEntity } from '@/modules/_base/base.abstract.entity'
import { Column, Entity } from 'typeorm'

@Entity('PackingPlan', { database: DATABASE_DATA_LAKE })
export class PackingEntity extends BaseAbstractEntity {
	@Column({ name: 'PO', type: 'varchar', length: 20, nullable: true })
	po: string

	@Column({ name: 'Color_code', type: 'varchar', length: 100, nullable: true })
	color_code: string

	@Column({ name: 'Size', type: 'varchar', length: 100, nullable: true })
	size: string

	@Column({ name: 'Factory_code', type: 'varchar', length: 100, nullable: true })
	factory_code: string

	@Column({ name: 'Item_qty', type: 'numeric', nullable: true })
	item_qty: number

	@Column({ name: 'Qty_per_pkg', type: 'numeric', nullable: true })
	qty_per_package: number

	@Column({ name: 'Pkg_count', type: 'numeric', nullable: true })
	package_count: number

	@Column({ name: 'Weight', type: 'float', nullable: true })
	weight: number

	@Column({ name: 'Scan_id', type: 'nvarchar', length: 50, nullable: true })
	scan_id: string

	@Column({ name: 'Actual_weight_in', type: 'float', nullable: true })
	actual_weight_in: number

	@Column({ name: 'Actual_weight_out', type: 'float', nullable: true })
	actual_weight_out: number

	@Column({ name: 'Series_number', type: 'nvarchar', length: 50 })
	series_number: string

	@Column({ name: 'SerialFrom', type: 'nvarchar', length: 50, nullable: true })
	serial_from: string

	@Column({ name: 'SerialTo', type: 'nvarchar', length: 50, nullable: true })
	serial_to: string

	@Column({ name: 'Ref_number', type: 'nvarchar', length: 100, nullable: true })
	ref_number: string

	constructor(packing: Partial<PackingEntity>) {
		super()
		Object.assign(this, packing)
	}
}
