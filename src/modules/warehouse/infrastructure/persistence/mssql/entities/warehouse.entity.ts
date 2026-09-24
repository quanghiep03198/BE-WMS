import { DATABASE_DATA_LAKE } from '@databases/constants'
import { BaseAbstractEntity } from '@modules/_base/base.abstract.entity'
import { WarehouseType } from '@modules/warehouse/domain/constants'
import { Column, Entity, Index, OneToMany } from 'typeorm'
import { StorageLocationEntity } from './storage-location.entity'

@Entity('dv_warehouseccodemst', { database: DATABASE_DATA_LAKE })
export class WarehouseEntity extends BaseAbstractEntity {
	@Index({ unique: true })
	@Column({ name: 'warehouse_num', length: 20 })
	code: string

	@Column({ name: 'warehouse_name', type: 'nvarchar', length: 50 })
	name: string

	@Column({ enum: WarehouseType, length: 10 })
	type_warehouse: string

	@Column({ name: 'cofactory_code', length: 10 })
	factory_code: string

	@Column({ type: 'int' })
	capacity: number

	@Column({ type: 'nvarchar', length: 50 })
	sync_id: number

	@OneToMany(() => StorageLocationEntity, (storage) => storage.warehouse)
	storage_locations: StorageLocationEntity[]

	constructor(warehouse: Partial<WarehouseEntity>) {
		super()
		Object.assign(this, warehouse)
	}
}
