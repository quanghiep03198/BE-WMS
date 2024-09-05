import { DataSources } from '@/common/constants/global.enum'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { EmployeeEntity } from './entities/employee.entity'
import { UserEntity } from './entities/user.entity'
import { UserController } from './user.controller'
import { UserService } from './user.service'

@Module({
	imports: [TypeOrmModule.forFeature([UserEntity, EmployeeEntity], DataSources.SYSCLOUD)],
	providers: [UserService],
	controllers: [UserController],
	exports: [UserService]
})
export class UserModule {}
