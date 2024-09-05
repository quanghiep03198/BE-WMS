import { Databases } from '@/common/constants/global.enum'
import { BaseAbstractEntity } from '@/modules/_base/base.abstract.entity'
import { Column, Entity, Index } from 'typeorm'
import { WarehouseTypes } from '../constants/enums'

@Entity('dv_warehouseccodemst', { database: Databases.DATALAKE })
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

	@Column({ type: 'bit' })
	is_default: boolean

	@Column({ type: 'bit' })
	is_disable: boolean

	@Column({ name: 'wa_area', type: 'numeric' })
	area: number

	constructor(warehouse: Partial<WarehouseEntity>) {
		super()
		Object.assign(this, warehouse)
	}
}
