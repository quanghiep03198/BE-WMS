import { EventListener } from '@common/decorators'
import { IEventListener } from '@common/interfaces/listener.interface'
import { UPDATED_USER_EVENT, UpdatedUserEvent } from '../../domain/events/updated-user.event'
import { RmdbsUserRepository } from '../persistence/mssql/repositories/rmdbs-user.repository'

@EventListener(UPDATED_USER_EVENT, { async: true })
export class UpdatedUserListener implements IEventListener<UpdatedUserEvent, void> {
	constructor(private readonly userRepository: RmdbsUserRepository) {}

	async handle(event: UpdatedUserEvent): Promise<void> {
		const update = Object.fromEntries(
			Object.entries(event.update).filter(([key]) =>
				['password', 'is_active', 'user_code_updated', 'user_name_updated'].includes(key)
			)
		)
		if (Object.keys(update).length > 0) await this.userRepository.updateOneByUsername(event.username, update)
	}
}