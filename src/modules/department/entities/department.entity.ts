import { DATABASE_SYSCLOUD } from '@/databases/constants'
import { BaseAbstractEntity } from '@/modules/_base/base.abstract.entity'
import { Column, Entity } from 'typeorm'

@Entity('dv_Deptmst', { database: DATABASE_SYSCLOUD })
export class DepartmentEntity extends BaseAbstractEntity {
	@Column({ name: 'ERP_dept_code' })
	dept_code: string

	@Column({ name: 'MES_dept_codeupper' })
	dept_code_upper: string

	@Column({ name: 'MES_dept_name' })
	dept_name: string

	@Column({ name: 'company_code' })
	factory_code: string
}
