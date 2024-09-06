import { Test, TestingModule } from '@nestjs/testing'
import { RFIDController } from '../rfid.controller'

describe('RFIDController', () => {
	let controller: RFIDController

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			controllers: [RFIDController]
		}).compile()

		controller = module.get<RFIDController>(RFIDController)
	})

	it('should be defined', () => {
		expect(controller).toBeDefined()
	})
})
