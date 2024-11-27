import { DATABASE_DATA_LAKE } from '@/databases/constants'
import { BoolBitTransformer, type Bit } from '@/databases/transformers/bool.transformer'
import { BaseAbstractEntity } from '@/modules/_base/base.abstract.entity'
import { Column, Entity, Index, OneToMany } from 'typeorm'
import { WarehouseTypes } from '../constants'
import { StorageLocationEntity } from './storage-location.entity'

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

	@Column({ name: 'wa_dept_code' })
	dept_code: string

	@Column({ name: 'wa_employee_code' })
	employee_code: string

	@Column({ name: 'wa_employee_name' })
	employee_name: string

	@Column({ type: 'bit', transformer: [new BoolBitTransformer()] })
	is_default: Bit | boolean

	@Column({ type: 'bit', transformer: [new BoolBitTransformer()] })
	is_disable: Bit | boolean

	@Column({ name: 'wa_area', type: 'numeric' })
	area: number

	// * Skip relationship
	@OneToMany(() => StorageLocationEntity, (storage) => storage.warehouse)
	storage_locations: StorageLocationEntity[]

	constructor(warehouse: Partial<WarehouseEntity>) {
		super()
		Object.assign(this, warehouse)
	}
}
