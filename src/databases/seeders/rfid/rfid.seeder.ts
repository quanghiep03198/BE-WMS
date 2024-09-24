import { RFIDCustomerEntity } from '@/modules/rfid/entities/rfid-customer.entity'
import { DataSource } from 'typeorm'
import { Seeder, SeederFactoryManager } from 'typeorm-extension'

export class RfidCustomerSeeder implements Seeder {
	async run(dataSource: DataSource, factoryManager: SeederFactoryManager) {
		const rfidCustomerFactory = factoryManager.get(RFIDCustomerEntity)
		return await rfidCustomerFactory.saveMany(1000)
	}
}
