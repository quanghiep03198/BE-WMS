import { DATA_SOURCE_SYSCLOUD } from '@/databases/constants'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { EmployeeController } from './controllers/employee.controller'
import { UserController } from './controllers/user.controller'
import { EmployeeEntity } from './entities/employee.entity'
import { UserEntity } from './entities/user.entity'
import { EmployeeService } from './services/employee.service'
import { UserService } from './services/user.service'

@Module({
	imports: [TypeOrmModule.forFeature([UserEntity, EmployeeEntity], DATA_SOURCE_SYSCLOUD)],
	providers: [UserService, EmployeeService],
	controllers: [UserController, EmployeeController],
	exports: [UserService]
})
export class UserModule {}
