import { DATASOURCE_DATA_LAKE } from '@/databases/constants'
import { DynamicDataSourceService } from '@/modules/_shared/dynamic-datasource.service'
import { Test, TestingModule } from '@nestjs/testing'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RFIDInventoryEntity } from '../entities/rfid-inventory.entity'
import { RFIDController } from '../rfid.controller'
import { RFIDService } from '../rfid.service'

describe('RFIDService', () => {
	let service: RFIDService

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			imports: [TypeOrmModule.forFeature([RFIDInventoryEntity], DATASOURCE_DATA_LAKE)],
			controllers: [RFIDController],
			providers: [RFIDService, DynamicDataSourceService]
		}).compile()

		service = module.get<RFIDService>(RFIDService)
	})

	it('should be defined', () => {
		expect(service).toBeDefined()
	})
})
