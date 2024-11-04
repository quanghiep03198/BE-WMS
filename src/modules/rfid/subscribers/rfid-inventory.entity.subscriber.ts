import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, EntitySubscriberInterface, EventSubscriber } from 'typeorm'
import { FPInventoryEntity } from '../entities/fp-inventory.entity'

@EventSubscriber()
export class RFIDInventoryEntitySubscriber implements EntitySubscriberInterface<FPInventoryEntity> {
	constructor(@InjectDataSource(DATA_SOURCE_DATA_LAKE) dataSource: DataSource) {
		dataSource.subscribers.push(this)
	}

	listenTo() {
		return FPInventoryEntity
	}

	// beforeUpdate(event: UpdateEvent<FPInventoryEntity>) {
	// 	if (!!event.entity.rfid_status) {
	// 		event.entity.quantity = event.entity.rfid_status === InventoryActions.INBOUND ? 1 : -1
	// 	}
	// }
}
