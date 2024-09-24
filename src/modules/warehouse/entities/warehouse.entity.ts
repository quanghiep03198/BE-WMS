import { DATABASE_DATA_LAKE } from '@/databases/constants'
import { BaseAbstractEntity } from '@/modules/_base/base.abstract.entity'
import { Column, Entity, Index } from 'typeorm'
import { WarehouseTypes } from '../constants'

@Entity('dv_warehouseccodemst', { database: DATABASE_DATA_LAKE })
export class WarehouseEntity extends BaseAbstractEntity {
	@Index({ unique: true })
	@Column({ length: 20 })
	warehouse_num: string

	@Column({ type: 'nvarchar', length: 50 })
	warehouse_name: string

	@Column({ enum: WarehouseTypes, length: 10 })
	type_warehouse: string

	@Column({ length: 10 })
	cofactory_code: string

	@Column({ type: 'bit', default: false })
	is_default: boolean

	@Column({ type: 'bit', default: false })
	is_disable: boolean

	@Column({ name: 'wa_area', type: 'numeric' })
	area: number

	// * Skip relationship
	// @OneToMany(() => StorageLocationEntity, (storage) => storage.warehouse)
	// storage_locations: StorageLocationEntity[]

	constructor(warehouse: Partial<WarehouseEntity>) {
		super()
		Object.assign(this, warehouse)
	}
}
