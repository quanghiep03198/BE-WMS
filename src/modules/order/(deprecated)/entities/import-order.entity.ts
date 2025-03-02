import { DATABASE_DATA_LAKE } from '@/databases/constants'
import { BaseAbstractEntity } from '@/modules/_base/base.abstract.entity'
import { Column, Entity } from 'typeorm'

/**
 * @deprecated
 */
@Entity('dv_whiomst', { database: DATABASE_DATA_LAKE, synchronize: false })
export class ImportOrderEntity extends BaseAbstractEntity {
	@Column()
	user_code_created: string

	@Column()
	user_name_created: string

	@Column()
	user_code_updated: string

	@Column()
	user_name_updated: string

	@Column()
	cofactory_code: string

	@Column()
	type_inventorylist: string

	@Column()
	sno_date: string

	@Column()
	sno_no: string

	@Column()
	dept_code: string

	@Column()
	dept_name: string

	@Column()
	warehouse_code: string

	@Column()
	warehouse_name: string

	@Column()
	sno_location: string
}
