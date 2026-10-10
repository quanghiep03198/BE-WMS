import { EventListener } from '@common/decorators'
import { IEventListener } from '@common/interfaces/listener.interface'
import { DATA_SOURCE_SYSCLOUD } from '@databases/constants'
import { InjectRepository } from '@nestjs/typeorm'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { Repository } from 'typeorm'
import { CREATED_USER_EVENT, CreatedUserEvent } from '../../domain/events/created-user.event'
import { UserEntity } from '../persistence/mssql/entities/user.entity'

@EventListener(CREATED_USER_EVENT, { async: true })
export class CreatedUserListener implements IEventListener<CreatedUserEvent, void> {
	constructor(
		@InjectRepository(UserEntity, DATA_SOURCE_SYSCLOUD) private readonly userRepository: Repository<UserEntity>,
		@InjectPinoLogger(CreatedUserListener.name) private readonly logger: PinoLogger
	) {}

	async handle(event: CreatedUserEvent): Promise<void> {
		this.logger.info(`Handling created user event for username: ${event.username}`)
		try {
			const createdUser = this.userRepository.create({
				username: event.username,
				password: event.password,
				user_code_created: event.createdBy,
				user_name_created: event.createdBy
			})

			await this.userRepository.save(createdUser)
		} catch (error) {
			this.logger.error(error)
		}
	}
}
