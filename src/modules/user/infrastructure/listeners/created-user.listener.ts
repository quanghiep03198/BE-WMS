import { EventListener } from '@common/decorators'
import { IEventListener } from '@common/interfaces/listener.interface'
import { CREATED_USER_EVENT, CreatedUserEvent } from '../../domain/events/created-user.event'
import { RmdbsUserRepository } from '../persistence/mssql/repositories/rmdbs-user.repository'

@EventListener(CREATED_USER_EVENT, { async: true })
export class CreatedUserListener implements IEventListener<CreatedUserEvent, void> {
	constructor(private readonly userRepository: RmdbsUserRepository) {}

	async handle(event: CreatedUserEvent): Promise<void> {
		await this.userRepository.insertOne({
			username: event.username,
			password: event.password,
			employee_code: event.username,
			user_code_created: event.createdBy,
			user_name_created: event.createdBy
		})
	}
}
