import { DATA_SOURCE_SYSCLOUD, DATA_WAREHOUSE_CONNECTION } from '@databases/constants'
import { Module, OnModuleInit } from '@nestjs/common'
import { InjectModel, MongooseModule } from '@nestjs/mongoose'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DepartmentController } from './department.controller'
import { DepartmentService } from './department.repository'
import { DEPARTMENT_REPOSITORY } from './department.repository.interface'
import { DepartmentTask } from './department.task'
import { DepartmentEntity } from './entities/department.entity'
import { Department, DEPARTMENT_COLLECTION, DepartmentModel, DepartmentSchema } from './schemas/department.schema'

@Module({
	imports: [
		MongooseModule.forFeature(
			[{ name: Department.name, collection: DEPARTMENT_COLLECTION, schema: DepartmentSchema }],
			DATA_WAREHOUSE_CONNECTION
		),
		TypeOrmModule.forFeature([DepartmentEntity], DATA_SOURCE_SYSCLOUD)
	],
	controllers: [DepartmentController],
	providers: [{ provide: DEPARTMENT_REPOSITORY, useClass: DepartmentService }, DepartmentTask],
	exports: [DEPARTMENT_REPOSITORY]
})
export class DepartmentModule implements OnModuleInit {
	constructor(
		@InjectModel(Department.name, DATA_WAREHOUSE_CONNECTION) private readonly departmentModel: DepartmentModel
	) {}

	async onModuleInit() {
		await this.departmentModel.syncIndexes()
	}
}
