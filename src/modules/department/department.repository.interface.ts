import { Languages } from '@common/constants'
import { IBaseRepository } from '@modules/_base/interfaces/base.abstract.repository.interface'
import { DepartmentGroup } from './constants'

export interface IDepartment {
	_id: TObjectId
	group: DepartmentGroup
	code: string
	name: { [K in Languages]: string }
}

export interface IDepartmentRepository extends IBaseRepository<IDepartment, string | TObjectId> {
	getAssemblyDepartments(): Promise<IDepartment[]>
	getSewingDepartments(): Promise<IDepartment[]>
}

export const DEPARTMENT_REPOSITORY = 'IDepartmentRepository'
