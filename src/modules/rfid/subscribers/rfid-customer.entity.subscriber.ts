import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, EntitySubscriberInterface, EventSubscriber, InsertEvent } from 'typeorm'
import { RFIDCustomerEntity } from '../entities/rfid-customer.entity'

@EventSubscriber()
export class RFIDCustomerEntitySubscriber implements EntitySubscriberInterface<RFIDCustomerEntity> {
	constructor(@InjectDataSource(DATA_SOURCE_DATA_LAKE) dataSource: DataSource) {
		dataSource.subscribers.push(this)
	}

	listenTo() {
		return RFIDCustomerEntity
	}

	async beforeInsert(event: InsertEvent<RFIDCustomerEntity>) {
		console.log(1)
		const count = await event.queryRunner.manager.count('keyid')
		event.entity.id = count + 1
	}
}
