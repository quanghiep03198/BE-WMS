import { DATA_SOURCE_SYSCLOUD } from '@databases/constants'
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
		const cteQueryBuilder = this.departmentRepository
			.createQueryBuilder()
			.select([
				/* SQL */ `CASE WHEN dept_name LIKE '成型%' THEN REPLACE(LEFT(dept_name, 4), '線', '') WHEN dept_name LIKE '二廠成型%' THEN REPLACE(LEFT(dept_name, 5), '線', '') ELSE NULL END AS dept_name`,
				/* SQL */ `dept_code`,
				/* SQL */ `ROW_NUMBER() OVER (PARTITION BY REPLACE(LEFT(dept_name, 4), '線', '') ORDER BY dept_code DESC) AS row_num`
			])
			.where({ factory_code: factoryCode })
			.andWhere({ dept_code: Or(Like(`${factoryCode}BA%`), Like(`${factoryCode}BS%`)) })
			.andWhere({
				dept_name: Or(Like('成型[A-Z]'), Like('成型[A-Z]線'), Like('成型[0-9][A-Z]'), Like('二廠成型%'))
			})

		return await this.departmentRepository.manager
			.createQueryBuilder()
			.addCommonTableExpression(cteQueryBuilder.getQuery(), 'cte')
			.select([/* SQL */ `cte.dept_code AS dept_code`, /* SQL */ `cte.dept_name AS dept_name`])
			.from('cte', 'cte')
			.where(/* SQL */ `row_num = 1`)
			.andWhere(/* SQL */ `LEN(dept_name) >= 3`)
			.setParameters(cteQueryBuilder.getParameters())
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
