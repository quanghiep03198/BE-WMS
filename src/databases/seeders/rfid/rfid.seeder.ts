import { RFIDMatchCusEntity } from '@/modules/rfid/entities/rfid-match-cus.entity'
import { DataSource } from 'typeorm'
import { Seeder, SeederFactoryManager } from 'typeorm-extension'

export class RfidCustomerSeeder implements Seeder {
	async run(dataSource: DataSource, factoryManager: SeederFactoryManager) {
		const rfidCustomerFactory = factoryManager.get(RFIDMatchCusEntity)
		return await rfidCustomerFactory.saveMany(1000)
	}
}
