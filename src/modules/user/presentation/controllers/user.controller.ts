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
import { DELETED_USER_EVENT, DeletedUserEvent } from '@modules/user/domain/events/deleted-user.event'
import { UPDATED_USER_EVENT, UpdatedUserEvent } from '@modules/user/domain/events/updated-user.event'
import { Body, Controller, ForbiddenException, HttpStatus, Inject, Param } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { ParseObjectIdPipe } from '@nestjs/mongoose'
import { Types } from 'mongoose'
import {
	ChangePasswordDTO,
	changePasswordValidator,
	CreateUserDTO,
	createUserValidator,
	UpdateProfileDTO,
	updateProfileValidator,
	UpdateUserDTO,
	UpdateUserStatusDTO,
	updateUserStatusValidator,
	updateUserValidator
} from '../../application/dto/user.dto'

@Controller('user')
export class UserController {
	constructor(
		@Inject(USER_REPOSITORY) private readonly userService: IUserRepository,
		private readonly eventEmitter: EventEmitter2
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
		@User('_id') id: Types.ObjectId,
		@Body(new ZodValidationPipe(createUserValidator)) createUserDTO: CreateUserDTO
	) {
		const createdUser = await this.userService.createOne({
			...createUserDTO,
			created_by: id
		})
		this.eventEmitter.emit(
			CREATED_USER_EVENT,
			new CreatedUserEvent(createUserDTO.username, createUserDTO.password, createUserDTO.created_by)
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
		@Body(new ZodValidationPipe(updateUserValidator)) createUserDTO: UpdateUserDTO
	) {
		const updatedUser = await this.userService.updateOneById(id, {
			...createUserDTO,
			updated_by: updatedBy._id
		})
		this.eventEmitter.emit(
			UPDATED_USER_EVENT,
			new UpdatedUserEvent(updatedUser.username, {
				user_code_updated: updatedBy?.username ?? 'sa',
				user_name_updated: updatedBy?.display_name ?? 'sa'
			})
		)
		return updatedUser
	}

	@RouteHandler({ method: HttpMethod.GET })
	@RequireAuthorized(UserRole.ADMIN)
	async getUsers() {
		return await this.userService.findAll()
	}

	@RouteHandler({
		endpoint: 'update-status/:id',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.OK,
		message: 'common.ok'
	})
	@RequireAuthorized(UserRole.ADMIN)
	async updateUserStatus(
		@User() currentUser: RequestUser,
		@Param('id', ParseObjectIdPipe) id: Types.ObjectId,
		@Body(new ZodValidationPipe(updateUserStatusValidator)) { is_active }: UpdateUserStatusDTO
	) {
		if (currentUser._id.toHexString() === id.toHexString()) {
			throw new ForbiddenException('You cannot change status your own account')
		}

		const updatedUser = await this.userService.updateOneById(id, {
			is_active,
			user_code_updated: currentUser.username,
			user_name_updated: currentUser.display_name
		})
		this.eventEmitter.emit(
			UPDATED_USER_EVENT,
			new UpdatedUserEvent(updatedUser.username, {
				is_active,
				user_code_updated: currentUser.username,
				user_name_updated: currentUser.display_name
			})
		)
		return updatedUser
	}

	// #region Self-Service Profile Management
	@RouteHandler({ endpoint: 'profile', method: HttpMethod.GET })
	@RequireAuthenticated()
	async getProfile(@User('_id') id: Types.ObjectId) {
		return await this.userService.findOneById(id)
	}

	@RouteHandler({
		endpoint: 'profile',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: { i18nKey: 'common.updated' }
	})
	@RequireAuthenticated()
	async updateProfile(
		@User('_id') id: Types.ObjectId,
		@Body(new ZodValidationPipe(updateProfileValidator)) payload: UpdateProfileDTO
	) {
		return await this.userService.updateOneById(id, payload)
	}

	@RouteHandler({
		endpoint: 'change-password',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: { i18nKey: 'common.updated' }
	})
	@RequireAuthenticated()
	async updatePassword(
		@User('_id') id: Types.ObjectId,
		@Body(new ZodValidationPipe(changePasswordValidator)) payload: ChangePasswordDTO
	) {
		const updatedUser = await this.userService.updatePassword(id, payload.password)
		this.eventEmitter.emit(
			UPDATED_USER_EVENT,
			new UpdatedUserEvent(updatedUser.username, { password: payload.password })
		)
		return updatedUser
	}

	@RouteHandler({
		endpoint: 'delete/:id',
		method: HttpMethod.DELETE,
		statusCode: HttpStatus.NO_CONTENT,
		message: { i18nKey: 'common.deleted' }
	})
	@RequireAuthorized(UserRole.ADMIN)
	async deleteUser(@Param('id', ParseObjectIdPipe) id: Types.ObjectId) {
		const user = await this.userService.findOneById(id)
		if (!user) return
		await this.userService.softDeleteOneById(id)
		this.eventEmitter.emit(DELETED_USER_EVENT, new DeletedUserEvent([user.username]))
	}
}
