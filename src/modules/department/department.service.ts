import { DataSources } from '@/common/constants/global.enum'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Like, Repository } from 'typeorm'
import { BaseAbstractService } from '../_base/base.abstract.service'
import { DepartmentEntity } from './entities/department.entity'

@Injectable()
export class DepartmentService extends BaseAbstractService<DepartmentEntity> {
	constructor(
		@InjectRepository(DepartmentEntity, DataSources.SYSCLOUD)
		private departmentRepository: Repository<DepartmentEntity>
	) {
		super(departmentRepository)
	}

	async getWarehouseDepartments(factoryCode: string) {
		const deptCodePattern = `${factoryCode}C3%`
		return await this.departmentRepository.findBy({ dept_code: Like(deptCodePattern) })
	}
}
