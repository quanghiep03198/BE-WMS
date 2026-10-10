import {
	HttpMethod,
	RequestUser,
	RequireAuthenticated,
	RequireAuthorized,
	RouteHandler,
	User
} from '@common/decorators'
import { ZodValidationPipe } from '@common/pipes'
import { IUserRepository, USER_REPOSITORY } from '@modules/user/application/ports/user.repository.port'
import { UserRole } from '@modules/user/domain/constants'
import { CREATED_USER_EVENT, CreatedUserEvent } from '@modules/user/domain/events/created-user.event'
import { UPDATED_USER_EVENT, UpdatedUserEvent } from '@modules/user/domain/events/updated-user.event'
import { Body, Controller, HttpStatus, Inject, Param } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Types } from 'mongoose'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import {
	ChangePasswordDTO,
	changePasswordValidator,
	CreateUserDTO,
	createUserValidator,
	UpdateProfileDTO,
	updateProfileValidator,
	UpdateUserDTO,
	updateUserValidator
} from '../../application/dto/user.dto'

@Controller('user')
export class UserController {
	constructor(
		@Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
		private readonly eventEmitter: EventEmitter2,
		@InjectPinoLogger(UserController.name)
		private readonly logger: PinoLogger
	) {}
	// #region User Management

	@RouteHandler({
		endpoint: 'create',
		method: HttpMethod.POST,
		statusCode: HttpStatus.CREATED,
		message: 'common.created'
	})
	@RequireAuthorized(UserRole.ADMIN)
	async createOne(
		@User() createdBy: RequestUser,
		@Body(new ZodValidationPipe(createUserValidator)) createUserDTO: CreateUserDTO
	) {
		const createdUser = await this.userRepository.createOne({
			...createUserDTO,
			created_by: createdBy._id
		})
		this.eventEmitter.emit(
			CREATED_USER_EVENT,
			new CreatedUserEvent(createUserDTO.username, createUserDTO.password, createdBy.username)
		)
		return createdUser
	}

	@RouteHandler({
		endpoint: 'update/:id',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: 'common.created'
	})
	@RequireAuthorized(UserRole.ADMIN)
	async updateOne(
		@User() updatedBy: RequestUser,
		@Param('id') id: Types.ObjectId,
		@Body(new ZodValidationPipe(updateUserValidator)) payload: UpdateUserDTO
	) {
		if (typeof payload.deleted === 'boolean') {
			if (payload.deleted) await this.userRepository.softDeleteOneById(id)
			else await this.userRepository.restoreOneById(id)
		}

		const updatedUser = await this.userRepository.updateOneById(id, {
			...payload,
			updated_by: updatedBy._id,
			...(typeof payload.deleted === 'boolean' && { deleted_by: payload.deleted ? updatedBy._id : null })
		})

		this.eventEmitter.emit(
			UPDATED_USER_EVENT,
			new UpdatedUserEvent(updatedUser?.username, {
				is_active: payload.deleted,
				user_code_updated: updatedBy?.username ?? 'sa',
				user_name_updated: updatedBy?.display_name ?? 'sa'
			})
		)
		return updatedUser
	}

	@RouteHandler({ method: HttpMethod.GET })
	@RequireAuthorized(UserRole.ADMIN)
	async getUsers() {
		return await this.userRepository.findAll()
	}

	// #region Self-Service Profile Management
	@RouteHandler({ endpoint: 'profile', method: HttpMethod.GET })
	@RequireAuthenticated()
	async getProfile(@User('_id') id: TObjectId) {
		return await this.userRepository.findOneById(id)
	}

	@RouteHandler({
		endpoint: 'profile',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: { i18nKey: 'common.updated' }
	})
	@RequireAuthenticated()
	async updateProfile(
		@User('_id') id: TObjectId,
		@Body(new ZodValidationPipe(updateProfileValidator)) payload: UpdateProfileDTO
	) {
		return await this.userRepository.updateOneById(id, payload)
	}

	@RouteHandler({
		endpoint: 'change-password',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: { i18nKey: 'common.updated' }
	})
	@RequireAuthenticated()
	async updatePassword(
		@User('_id') id: TObjectId,
		@Body(new ZodValidationPipe(changePasswordValidator)) payload: ChangePasswordDTO
	) {
		const updatedUser = await this.userRepository.updatePassword(id, payload.password)
		this.eventEmitter.emit(
			UPDATED_USER_EVENT,
			new UpdatedUserEvent(updatedUser.username, { password: payload.password })
		)
		return updatedUser
	}
}
