import { DATA_SOURCE_SYSCLOUD } from '@/databases/constants'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Like, Repository } from 'typeorm'
import { DepartmentEntity } from './entities/department.entity'

@Injectable()
export class DepartmentService {
	constructor(
		@InjectRepository(DepartmentEntity, DATA_SOURCE_SYSCLOUD)
		private departmentRepository: Repository<DepartmentEntity>
	) {}

	async getWarehouseDepartments(factoryCode: string) {
		return await this.departmentRepository
			.createQueryBuilder()
			.select(['DISTINCT ERP_dept_code AS dept_code', 'MES_dept_name AS dept_name'])
			.where({ dept_code: Like(`${factoryCode}C3%`) })
			.getRawMany()
	}

	async getShapingDepartment(factoryCode: string) {
		return await this.departmentRepository
			.createQueryBuilder()
			.select(['DISTINCT ERP_dept_code AS dept_code', 'MES_dept_name AS dept_name'])
			.where('company_code = :factoryCode')
			.andWhere(
				`MES_dept_codeupper = CASE 
						WHEN :factoryCode = 'VA1' THEN 'YS06'
						WHEN :factoryCode = 'VB1' THEN 'SS06'
						WHEN :factoryCode = 'VB2' THEN 'SS07'
						WHEN :factoryCode = 'CA1' THEN 'CS07'
						ELSE MES_dept_codeupper
				END`
			)
			.setParameters({ factoryCode })
			.getRawMany()
	}
}
