import { SYSCLOUD_CONNECTION } from '@/databases/constants'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { EmployeeEntity } from './entities/employee.entity'
import { UserEntity } from './entities/user.entity'
import { UserController } from './user.controller'
import { UserService } from './user.service'

@Module({
	imports: [TypeOrmModule.forFeature([UserEntity, EmployeeEntity], SYSCLOUD_CONNECTION)],
	providers: [UserService],
	controllers: [UserController],
	exports: [UserService]
})
export class UserModule {}
