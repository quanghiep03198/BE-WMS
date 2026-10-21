import { DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { BaseMongoRepository } from '@modules/_base/repositories/base-mongo.abstract.repository'
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { DepartmentGroup } from './constants'
import { IDepartmentRepository } from './department.repository.interface'
import { Department, DepartmentDocument, DepartmentModel } from './schemas/department.schema'

@Injectable()
export class DepartmentService extends BaseMongoRepository<DepartmentDocument> implements IDepartmentRepository {
	constructor(
		@InjectModel(Department.name, DATA_WAREHOUSE_CONNECTION)
		private readonly departmentModel: DepartmentModel
	) {
		super(departmentModel)
	}

	async getAssemblyDepartments() {
		return await this.departmentModel.find({ group: DepartmentGroup.ASSEMBLY })
	}

	async getSewingDepartments() {
		return await this.departmentModel.find({ group: DepartmentGroup.SEWING })
	}
}
