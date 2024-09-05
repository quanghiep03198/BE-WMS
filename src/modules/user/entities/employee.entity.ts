import { Databases } from '@/common/constants/global.enum'
import { BaseAbstractEntity } from '@/modules/_base/base.abstract.entity'
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

@Entity('ts_employee', { database: Databases.SYSCLOUD })
export class EmployeeEntity extends BaseAbstractEntity {
	@PrimaryGeneratedColumn()
	keyid: number

	@Column({ type: 'nvarchar', length: 20 })
	employee_code: string

	@Column({ type: 'nvarchar', length: 100 })
	employee_name: string

	@Column({ type: 'nvarchar', length: 100 })
	email: string

	@Column({ name: 'mobilephone' })
	phone: string

	constructor(employee: Partial<EmployeeEntity>) {
		super()
		Object.assign(this, employee)
	}
}
