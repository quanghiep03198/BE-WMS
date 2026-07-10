import { DATA_SOURCE_SYSCLOUD } from '@databases/constants'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, EventSubscriber, InsertEvent, UpdateEvent, type EntitySubscriberInterface } from 'typeorm'
import { UserEntity } from '../entities/user.entity'

@EventSubscriber()
export class UserEntitySubscriber implements EntitySubscriberInterface<UserEntity> {
	constructor(@InjectDataSource(DATA_SOURCE_SYSCLOUD) dataSource: DataSource) {
		dataSource.subscribers.push(this)
	}

	listenTo() {
		return UserEntity
	}

	beforeInsert(event: InsertEvent<UserEntity>): void {
		if (event.entity.employee_code) event.entity.employee_code = event.entity.employee_code.toUpperCase()
		if (event.entity.password) event.entity.encryptPassword()
	}

	beforeUpdate(event: UpdateEvent<UserEntity>): void {
		if (event.entity.employee_code) event.entity.employee_code = event.entity.employee_code.toUpperCase()
	}
}
