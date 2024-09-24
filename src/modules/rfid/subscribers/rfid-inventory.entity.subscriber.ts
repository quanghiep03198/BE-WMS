import { DATASOURCE_DATA_LAKE } from '@/databases/constants'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, EntitySubscriberInterface, EventSubscriber, UpdateEvent } from 'typeorm'
import { InventoryActions } from '../constants'
import { RFIDInventoryEntity } from '../entities/rfid-inventory.entity'

@EventSubscriber()
export class RFIDInventoryEntitySubscriber implements EntitySubscriberInterface<RFIDInventoryEntity> {
	constructor(@InjectDataSource(DATASOURCE_DATA_LAKE) dataSource: DataSource) {
		dataSource.subscribers.push(this)
	}

	listenTo() {
		return RFIDInventoryEntity
	}

	beforeUpdate(event: UpdateEvent<RFIDInventoryEntity>) {
		if (!!event.entity.rfid_status) {
			event.entity.quantity = event.entity.rfid_status === InventoryActions.INBOUND ? 1 : -1
		}
	}
}
