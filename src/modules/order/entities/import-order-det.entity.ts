import { DATABASE_DATA_LAKE } from '@/databases/constants'
import { BaseAbstractEntity } from '@/modules/_base/base.abstract.entity'
import { Column, Entity } from 'typeorm'

@Entity('dv_whiodet', { database: DATABASE_DATA_LAKE, synchronize: false })
export class ImportOrderDetEntity extends BaseAbstractEntity {
	@Column()
	user_code_created: string

	@Column()
	user_name_created: string

	@Column()
	user_name_updated: string

	@Column()
	user_code_updated: string

	@Column()
	sno_no: string

	@Column()
	custbrand_id: string

	@Column()
	sno_templink: string

	@Column()
	mo_templink: string

	@Column()
	mo_no: string

	@Column()
	sno_boxqty: number

	@Column()
	sno_qty: number

	@Column()
	storage_num: string

	@Column()
	is_bgrade: string

	@Column()
	employee_code: string

	@Column()
	employee_name: string

	@Column()
	remark: string
}
