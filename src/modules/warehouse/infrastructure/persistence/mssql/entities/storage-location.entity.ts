import { DATABASE_DATA_LAKE } from '@databases/constants'
import { BaseAbstractEntity } from '@modules/_base/base.abstract.entity'
import { StorageLocationType } from '@modules/warehouse/domain/constants'
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { WarehouseEntity } from './warehouse.entity'

@Entity('dv_warehouseccodedet', { database: DATABASE_DATA_LAKE, synchronize: true })
export class StorageLocationEntity extends BaseAbstractEntity {
	@Index({ unique: true })
	@Column({ name: 'storage_num', type: 'varchar', length: 20 })
	code: string

	@Column({ name: 'storage_name', type: 'nvarchar', length: 50 })
	name: string

	@Column({
		type: 'varchar',
		enum: StorageLocationType,
		length: 10,
		default: StorageLocationType.FINISHED_PRODUCTION_AREA
	})
	type_storage: string

	@Column({ type: 'int' })
	warehouse_id: number

	@Column({ name: 'cofactory_code', type: 'varchar', length: 10 })
	factory_code: string

	@ManyToOne(() => WarehouseEntity, (warehouse) => warehouse.storage_locations)
	@JoinColumn({ name: 'warehouse_id' })
	warehouse: WarehouseEntity

	@Column({ type: 'nvarchar', length: 50 })
	sync_id: number

	constructor(storageLocation: Partial<StorageLocationEntity>) {
		super()
		Object.assign(this, storageLocation)
	}
}
