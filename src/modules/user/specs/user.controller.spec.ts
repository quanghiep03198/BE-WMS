import { DATA_SOURCE_SYSCLOUD } from '@/databases/constants'
import { Test, TestingModule } from '@nestjs/testing'
import { TypeOrmModule } from '@nestjs/typeorm'
import { UserController } from '../controllers/user.controller'
import { EmployeeEntity } from '../entities/employee.entity'
import { UserEntity } from '../entities/user.entity'
import { UserService } from '../services/user.service'

describe('UserController', () => {
	let controller: UserController

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			imports: [TypeOrmModule.forFeature([UserEntity, EmployeeEntity], DATA_SOURCE_SYSCLOUD)],
			providers: [UserService],
			controllers: [UserController],
			exports: [UserService]
		}).compile()

		controller = module.get<UserController>(UserController)
	})

	it('should be defined', () => {
		expect(controller).toBeDefined()
	})
})
