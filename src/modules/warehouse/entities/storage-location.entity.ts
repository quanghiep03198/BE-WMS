import { DATABASE_DATA_LAKE } from '@/databases/constants'
import { BaseAbstractEntity } from '@/modules/_base/base.abstract.entity'
import { Column, Entity } from 'typeorm'
import { WarehouseStorageTypes } from '../constants'

@Entity('dv_warehouseccodedet', { database: DATABASE_DATA_LAKE })
export class StorageLocationEntity extends BaseAbstractEntity {
	@Column({ type: 'varchar', length: 20 })
	storage_num: string

	@Column({ type: 'nvarchar', length: 50 })
	storage_name: string

	@Column({ type: 'varchar', enum: WarehouseStorageTypes, length: 10 })
	type_storage: string

	@Column({ type: 'varchar', length: 20 })
	warehouse_num: string

	@Column({ type: 'nvarchar', length: 50 })
	warehouse_name: string

	@Column({ type: 'varchar', length: 10 })
	cofactory_code: string

	constructor(storageLocation: Partial<StorageLocationEntity>) {
		super()
		Object.assign(this, storageLocation)
	}
}
