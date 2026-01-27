import { DATA_SOURCE_SYSCLOUD } from '@/databases/constants'
import { InjectDataSource } from '@nestjs/typeorm'
import { EventSubscriber, InsertEvent, UpdateEvent, type DataSource, type EntitySubscriberInterface } from 'typeorm'
import { UserEntity } from '../entities/user.entity'

@EventSubscriber()
export class UserEntitySubscriber implements EntitySubscriberInterface<UserEntity> {
	constructor(@InjectDataSource(DATA_SOURCE_SYSCLOUD) readonly dataSource: DataSource) {
		dataSource.subscribers.push(this)
	}

	listenTo() {
		return UserEntity
	}

	beforeInsert(event: InsertEvent<UserEntity>): Promise<any> | void {
		if (event.entity.password) event.entity.encryptPassword()
	}

	beforeUpdate(event: UpdateEvent<UserEntity>): Promise<any> | void {
		if (event.entity && event.entity.password && event.entity.password !== event.databaseEntity.password)
			event.entity.encryptPassword()
	}
}
