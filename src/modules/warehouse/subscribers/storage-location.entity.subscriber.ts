import { DATASOURCE_DATA_LAKE } from '@/databases/constants'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, EntitySubscriberInterface, EventSubscriber, InsertEvent } from 'typeorm'
import { StorageLocationEntity } from '../entities/storage-location.entity'

@EventSubscriber()
export class StorageLocationSubscriber implements EntitySubscriberInterface<StorageLocationEntity> {
	constructor(@InjectDataSource(DATASOURCE_DATA_LAKE) dataSource: DataSource) {
		dataSource.subscribers.push(this)
	}

	listenTo() {
		return StorageLocationEntity
	}

	async beforeInsert(event: InsertEvent<StorageLocationEntity>) {
		const count = await event.manager
			.getRepository(StorageLocationEntity)
			.count({ where: { type_storage: event.entity.type_storage } })
		event.entity.storage_num = `${event.entity.cofactory_code}${event.entity.type_storage}${count + 1}`
	}
}
