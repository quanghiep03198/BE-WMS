import { SYSCLOUD_CONNECTION } from '@/databases/constants'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DepartmentController } from './department.controller'
import { DepartmentService } from './department.service'
import { DepartmentEntity } from './entities/department.entity'

@Module({
	imports: [TypeOrmModule.forFeature([DepartmentEntity], SYSCLOUD_CONNECTION)],
	controllers: [DepartmentController],
	providers: [DepartmentService]
})
export class DepartmentModule {}
