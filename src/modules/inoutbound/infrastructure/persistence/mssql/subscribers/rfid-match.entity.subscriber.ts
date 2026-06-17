import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, EntitySubscriberInterface, EventSubscriber, InsertEvent } from 'typeorm'
import { RFIDMatchEntity } from '../entities/rfid-match.entity'

@EventSubscriber()
export class RFIDCustomerEntitySubscriber implements EntitySubscriberInterface<RFIDMatchEntity> {
	constructor(@InjectDataSource(DATA_SOURCE_DATA_LAKE) dataSource: DataSource) {
		dataSource.subscribers.push(this)
	}

	listenTo() {
		return RFIDMatchEntity
	}

	async beforeInsert(event: InsertEvent<RFIDMatchEntity>) {
		const count = await event.queryRunner.manager.count('keyid')
		event.entity.id = count + 1
	}
}
