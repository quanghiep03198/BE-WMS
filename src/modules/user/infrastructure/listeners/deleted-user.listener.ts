import { EventListener } from '@common/decorators'
import { IEventListener } from '@common/interfaces/listener.interface'
import { DELETED_USER_EVENT, DeletedUserEvent } from '../../domain/events/deleted-user.event'
import { RmdbsUserRepository } from '../persistence/mssql/repositories/rmdbs-user.repository'

@EventListener(DELETED_USER_EVENT, { async: true })
export class DeletedUserListener implements IEventListener<DeletedUserEvent, void> {
	constructor(private readonly userRepository: RmdbsUserRepository) {}

	async handle(event: DeletedUserEvent): Promise<void> {
		await this.userRepository.deleteManyByUsernames(event.usernames)
	}
}
