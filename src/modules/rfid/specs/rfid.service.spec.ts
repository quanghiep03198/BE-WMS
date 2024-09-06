import { Test, TestingModule } from '@nestjs/testing'
import { RFIDService } from '../rfid.service'

describe('RFIDService', () => {
	let service: RFIDService

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [RFIDService]
		}).compile()

		service = module.get<RFIDService>(RFIDService)
	})

	it('should be defined', () => {
		expect(service).toBeDefined()
	})
})
