import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, EntitySubscriberInterface, EventSubscriber, UpdateEvent } from 'typeorm'
import { RFIDInventoryEntity } from '../rfid/entities/rfid-inventory.entity'
import { BaseAbstractEntity } from './base.abstract.entity'

@EventSubscriber()
export class RFIDInventoryEntitySubscriber implements EntitySubscriberInterface<BaseAbstractEntity> {
	constructor(@InjectDataSource() dataSource: DataSource) {
		dataSource.subscribers.push(this)
	}

	listenTo() {
		return BaseAbstractEntity
	}

	beforeUpdate(event: UpdateEvent<RFIDInventoryEntity>) {
		event.entity.updated_at = new Date()
	}
}
