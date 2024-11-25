import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, EntitySubscriberInterface, EventSubscriber, InsertEvent } from 'typeorm'
import { RFIDMatchCusEntity } from '../entities/rfid-match-cus.entity'

@EventSubscriber()
export class RFIDCustomerEntitySubscriber implements EntitySubscriberInterface<RFIDMatchCusEntity> {
	constructor(@InjectDataSource(DATA_SOURCE_DATA_LAKE) dataSource: DataSource) {
		dataSource.subscribers.push(this)
	}

	listenTo() {
		return RFIDMatchCusEntity
	}

	async beforeInsert(event: InsertEvent<RFIDMatchCusEntity>) {
		console.log(1)
		const count = await event.queryRunner.manager.count('keyid')
		event.entity.id = count + 1
	}
}
