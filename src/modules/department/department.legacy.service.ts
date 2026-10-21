import { DATA_SOURCE_SYSCLOUD } from '@databases/constants'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { Like, Or, Repository } from 'typeorm'
import { DepartmentEntity } from './entities/department.entity'

@Injectable()
export class LegacyDepartmentService {
	constructor(
		@InjectRepository(DepartmentEntity, DATA_SOURCE_SYSCLOUD)
		private readonly departmentRepository: Repository<DepartmentEntity>,
		private readonly configService: ConfigService<ProcessEnv>
	) {}

	/**
	 * @deprecated
	 * @param factoryCode
	 * @returns
	 */
	async getWarehouseDepartments() {
		const factoryCode = this.configService.get<FactoryCode>('APP_TENANCY')

		return await this.departmentRepository
			.createQueryBuilder()
			.select([/* SQL */ `DISTINCT dept_name AS name`, /* SQL */ `MIN(dept_code) AS code`])
			.groupBy('dept_name')
			.orderBy('dept_code', 'ASC')
			.where({ dept_code: Like(`${factoryCode}C3%`) })
			.getRawMany()
	}

	async getAssemblyDepartments() {
		const factoryCode = this.configService.get<FactoryCode>('APP_TENANCY')

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
			.select([/* SQL */ `dept_code AS code`, /* SQL */ `dept_name AS name`])
			.from('cte', 'cte')
			.where(/* SQL */ `row_num = 1`)
			.andWhere(/* SQL */ `LEN(dept_name) >= 3`)
			.setParameters(cteQueryBuilder.getParameters())
			.getRawMany<{ code: string; name: string }>()
	}

	async getSewingDepartments() {
		return await this.departmentRepository
			.createQueryBuilder()
			.select([/* SQL */ `DISTINCT dept_name AS name`, /* SQL */ `MIN(dept_code) AS code`])
			.where({ factory_code: this.configService.get<FactoryCode>('APP_TENANCY') })
			.andWhere({ dept_name: Or(Like('%針車[0-9]%')) })
			.groupBy('dept_name')
			.orderBy('dept_name', 'ASC')
			.getRawMany<{ dept_code: string; dept_name: string }>()
	}
}
