import { DATASOURCE_DATA_LAKE } from '@/databases/constants'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, EntitySubscriberInterface, EventSubscriber, UpdateEvent } from 'typeorm'
import { PackingEntity } from '../entities/packing.entity'

@EventSubscriber()
export class PackingEntitySubscriber implements EntitySubscriberInterface<PackingEntity> {
	constructor(@InjectDataSource(DATASOURCE_DATA_LAKE) dataSource: DataSource) {
		dataSource.subscribers.push(this)
	}

	listenTo() {
		return PackingEntity
	}

	beforeUpdate(event: UpdateEvent<PackingEntity>) {
		event.entity.updated = new Date()
	}
}
