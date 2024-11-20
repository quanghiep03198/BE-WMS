import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, EntitySubscriberInterface, EventSubscriber, InsertEvent } from 'typeorm'
import { WarehouseEntity } from '../entities/warehouse.entity'

@EventSubscriber()
export class WarehouseSubscriber implements EntitySubscriberInterface<WarehouseEntity> {
	constructor(@InjectDataSource(DATA_SOURCE_DATA_LAKE) dataSource: DataSource) {
		dataSource.subscribers.push(this)
	}

	listenTo() {
		return WarehouseEntity
	}

	async beforeInsert(event: InsertEvent<WarehouseEntity>) {
		const count = await event.manager.getRepository(WarehouseEntity).count()
		event.entity.warehouse_num = `${event.entity.cofactory_code}${event.entity.type_warehouse}${count + 1}`
	}
}
