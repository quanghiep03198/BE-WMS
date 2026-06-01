import { DATA_SOURCE_SYSCLOUD } from '@/databases/constants'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Like, Or, Repository } from 'typeorm'
import { DepartmentEntity } from './entities/department.entity'

@Injectable()
export class DepartmentService {
	constructor(
		@InjectRepository(DepartmentEntity, DATA_SOURCE_SYSCLOUD)
		private readonly departmentRepository: Repository<DepartmentEntity>
	) {}

	async getWarehouseDepartments(factoryCode: string) {
		return await this.departmentRepository
			.createQueryBuilder()
			.select([/* SQL */ `DISTINCT dept_name AS dept_name`, /* SQL */ `MIN(dept_code) AS dept_code`])
			.groupBy('dept_name')
			.orderBy('dept_code', 'ASC')
			.where({ dept_code: Like(`${factoryCode}C3%`) })
			.getRawMany()
	}

	async getShapingDepartment(factoryCode: string) {
		return await this.departmentRepository
			.createQueryBuilder()
			.select([/* SQL */ `REPLACE(LEFT(dept_name, 4), '線', '')`, /* SQL */ `MIN(dept_code) AS dept_code`])
			.where({ factory_code: factoryCode })
			.andWhere({ dept_code: Like(`${factoryCode}BA%`) })
			.andWhere({
				dept_name: Or(Like('成型[A-Z]'), Like('成型[A-Z]線'), Like('成型[0-9][A-Z]'))
			})
			.groupBy(/* SQL */ `REPLACE(LEFT(dept_name, 4), '線', '')`)
			.orderBy('dept_name', 'ASC')
			.getRawMany<{ dept_code: string; dept_name: string }>()
	}

	async getSewingDepartment(factoryCode: string) {
		return await this.departmentRepository
			.createQueryBuilder()
			.select([/* SQL */ `DISTINCT dept_name AS dept_name`, /* SQL */ `MIN(dept_code) AS dept_code`])
			.where({ factory_code: factoryCode })
			.andWhere({ dept_name: Or(Like('%針車[0-9]%')) })
			.groupBy('dept_name')
			.orderBy('dept_code', 'ASC')
			.getRawMany<{ dept_code: string; dept_name: string }>()
	}
}
