import { DATABASE_DATA_LAKE } from '@/databases/constants'
import { BoolBitTransformer } from '@/databases/transformers/bool.transformer'
import { BaseAbstractEntity } from '@/modules/_base/base.abstract.entity'
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { WarehouseStorageTypes } from '../constants'
import { WarehouseEntity } from './warehouse.entity'

@Entity('dv_warehouseccodedet', { database: DATABASE_DATA_LAKE, synchronize: true })
export class StorageLocationEntity extends BaseAbstractEntity {
	@Index({ unique: true })
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

	@Column({ type: 'bit', default: 0, transformer: new BoolBitTransformer() })
	is_default: boolean

	@Column({ type: 'bit', default: 0, transformer: new BoolBitTransformer() })
	is_disable: boolean

	@ManyToOne(() => WarehouseEntity, (warehouse) => warehouse.storage_locations)
	@JoinColumn({ name: 'warehouse_num', referencedColumnName: 'warehouse_num' })
	warehouse: WarehouseEntity

	constructor(storageLocation: Partial<StorageLocationEntity>) {
		super()
		Object.assign(this, storageLocation)
	}
}
