import { DATA_SOURCE_SYSCLOUD } from '@/databases/constants'
import { BaseAbstractService } from '@/modules/_base/base.abstract.service'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Like, Repository } from 'typeorm'
import { EmployeeEntity } from '../entities/employee.entity'

@Injectable()
export class EmployeeService extends BaseAbstractService<EmployeeEntity> {
	constructor(
		@InjectRepository(EmployeeEntity, DATA_SOURCE_SYSCLOUD)
		private employeeRepository: Repository<EmployeeEntity>
	) {
		super(employeeRepository)
	}

	async searchEmployee(searchTerm: string) {
		return await this.employeeRepository.find({
			where: [{ employee_code: Like(`${searchTerm}%`) }, { employee_name: Like(`${searchTerm}%`) }],
			take: 5
		})
	}
}
