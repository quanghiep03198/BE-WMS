import { RFIDMatchCustomerEntity } from '@/modules/rfid/entities/rfid-customer-match.entity'
import { DataSource } from 'typeorm'
import { Seeder, SeederFactoryManager } from 'typeorm-extension'

export class RfidCustomerSeeder implements Seeder {
	async run(dataSource: DataSource, factoryManager: SeederFactoryManager) {
		const rfidCustomerFactory = factoryManager.get(RFIDMatchCustomerEntity)
		return await rfidCustomerFactory.saveMany(1000)
	}
}
