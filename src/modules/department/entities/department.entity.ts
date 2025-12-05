import { DATABASE_SYSCLOUD } from '@/databases/constants'
import { BaseAbstractEntity } from '@/modules/_base/base.abstract.entity'
import { Column, Entity } from 'typeorm'

@Entity('ts_dept', { database: DATABASE_SYSCLOUD, synchronize: false })
export class DepartmentEntity extends BaseAbstractEntity {
	@Column({ name: 'dept_code' })
	dept_code: string

	@Column({ name: 'dept_name' })
	dept_name: string

	@Column({ name: 'company_code' })
	factory_code: string
}
