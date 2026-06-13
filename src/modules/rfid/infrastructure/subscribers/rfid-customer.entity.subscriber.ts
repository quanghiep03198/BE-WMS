import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, EntitySubscriberInterface, EventSubscriber, InsertEvent } from 'typeorm'
import { RFIDMatchCustomerEntity } from '../entities/rfid-customer-match.entity'

@EventSubscriber()
export class RFIDCustomerEntitySubscriber implements EntitySubscriberInterface<RFIDMatchCustomerEntity> {
	constructor(@InjectDataSource(DATA_SOURCE_DATA_LAKE) dataSource: DataSource) {
		dataSource.subscribers.push(this)
	}

	listenTo() {
		return RFIDMatchCustomerEntity
	}

	async beforeInsert(event: InsertEvent<RFIDMatchCustomerEntity>) {
		const count = await event.queryRunner.manager.count('keyid')
		event.entity.id = count + 1
	}
}
