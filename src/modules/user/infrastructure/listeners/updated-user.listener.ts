import { EventListener } from '@common/decorators'
import { IEventListener } from '@common/interfaces/listener.interface'
import { DATA_SOURCE_SYSCLOUD } from '@databases/constants'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { UPDATED_USER_EVENT, UpdatedUserEvent } from '../../domain/events/updated-user.event'
import { UserEntity } from '../persistence/mssql/entities/user.entity'

@EventListener(UPDATED_USER_EVENT, { async: true })
export class UpdatedUserListener implements IEventListener<UpdatedUserEvent, void> {
	constructor(
		@InjectRepository(UserEntity, DATA_SOURCE_SYSCLOUD) private readonly userRepository: Repository<UserEntity>
	) {}

	async handle(event: UpdatedUserEvent): Promise<void> {
		const update = Object.fromEntries(
			Object.entries(event.update).filter(([key]) =>
				['password', 'is_active', 'user_code_updated', 'user_name_updated'].includes(key)
			)
		)
		if (Object.keys(update).length > 0) await this.userRepository.update({ username: event.username }, update)
	}
}
