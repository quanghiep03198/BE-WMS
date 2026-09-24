import { DATA_SOURCE_DATA_LAKE } from '@databases/constants'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, EntitySubscriberInterface, EventSubscriber, InsertEvent } from 'typeorm'
import { StorageLocationEntity } from '../entities/storage-location.entity'

@EventSubscriber()
export class StorageLocationSubscriber implements EntitySubscriberInterface<StorageLocationEntity> {
	constructor(@InjectDataSource(DATA_SOURCE_DATA_LAKE) dataSource: DataSource) {
		dataSource.subscribers.push(this)
	}

	listenTo() {
		return StorageLocationEntity
	}

	async beforeInsert(event: InsertEvent<StorageLocationEntity>) {
		// event.entity.code = event.entity. + event.entity.name
	}
}
