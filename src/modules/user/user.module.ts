import { DATA_SOURCE_SYSCLOUD } from '@/databases/constants'
import { PermissionController } from '@/modules/user/controllers/permission.controller'
import { PermissionEntity } from '@/modules/user/entities/permission.entity'
import { PermissionService } from '@/modules/user/services/permission.service'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { EmployeeController } from './controllers/employee.controller'
import { UserController } from './controllers/user.controller'
import { EmployeeEntity } from './entities/employee.entity'
import { UserEntity } from './entities/user.entity'
import { EmployeeService } from './services/employee.service'
import { UserService } from './services/user.service'

@Module({
	imports: [TypeOrmModule.forFeature([UserEntity, EmployeeEntity, PermissionEntity], DATA_SOURCE_SYSCLOUD)],
	providers: [UserService, EmployeeService, PermissionService],
	controllers: [UserController, EmployeeController, PermissionController],
	exports: [UserService]
})
export class UserModule {}
