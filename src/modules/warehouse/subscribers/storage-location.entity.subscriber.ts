import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
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
		const count = await event.manager.getRepository(StorageLocationEntity).count({
			where: {
				type_storage: event.entity.type_storage,
				cofactory_code: event.entity.cofactory_code,
				warehouse_num: event.entity.warehouse_num
			}
		})

		const nextIndex = String(count + 1)
			.toString()
			.padStart(3, '0')

		event.entity.storage_num = `${event.entity.cofactory_code}${event.entity.type_storage}${nextIndex}`
	}
}
