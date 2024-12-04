import { DATABASE_DATA_LAKE } from '@/databases/constants'
import { BoolBitTransformer } from '@/databases/transformers/bool.transformer'
import { BaseAbstractEntity } from '@/modules/_base/base.abstract.entity'
import { Column, Entity } from 'typeorm'

@Entity('dv_whiodet', { database: DATABASE_DATA_LAKE, synchronize: false })
export class ImportOrderDetailEntity extends BaseAbstractEntity {
	@Column({ type: 'nvarchar', length: 50 })
	sno_no: string

	@Column({ type: 'nvarchar', length: 50 })
	custbrand_id: string

	@Column({ type: 'nvarchar', length: 20 })
	sno_templink: string

	@Column({ type: 'nvarchar', length: 20 })
	mo_templink: string

	@Column({ type: 'nvarchar', length: 20 })
	mo_no: string

	@Column({ type: 'numeric' })
	sno_boxqty: number

	@Column({ type: 'numeric', nullable: true })
	sno_qty: number

	@Column({ type: 'nvarchar', length: 50 })
	storage_num: string

	@Column({ type: 'bit', transformer: new BoolBitTransformer(), default: false })
	is_bgrade: boolean

	@Column({ type: 'nvarchar', length: 50, nullable: true })
	employee_code: string

	@Column({ type: 'nvarchar', length: 50, nullable: true })
	employee_name: string
}
