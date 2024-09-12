import { Test, TestingModule } from '@nestjs/testing'
import { UserService } from '../services/user.service'
import { UserModule } from '../user.module'

describe('UserService', () => {
	let service: UserService

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			imports: [{ module: UserModule }]
		}).compile()

		service = module.get<UserService>(UserService)
	})

	it('should be defined', () => {
		expect(service).toBeDefined()
	})
})
