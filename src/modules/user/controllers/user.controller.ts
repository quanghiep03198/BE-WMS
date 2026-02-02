import {
	HttpMethod,
	RequestUser,
	RequireAuthenticated,
	RequireAuthorized,
	RouteHandler,
	User
} from '@/common/decorators'
import { ZodValidationPipe } from '@/common/pipes'
import { Body, Controller, ForbiddenException, HttpStatus, Param } from '@nestjs/common'
import { UserRole } from '../constants'
import {
	ChangePasswordDTO,
	changePasswordValidator,
	UpdateProfileDTO,
	updateProfileValidator,
	UpdateUserDTO,
	UpdateUserStatusDTO,
	updateUserStatusValidator,
	updateUserValidator
} from '../dto/user.dto'
import { UserService } from '../services/user.service'
import { CreateUserDTO, createUserValidator } from './../dto/user.dto'

@Controller('user')
export class UserController {
	constructor(private readonly userService: UserService) {}
	// #region User Management

	@RouteHandler({
		endpoint: 'create',
		method: HttpMethod.POST,
		statusCode: HttpStatus.CREATED,
		message: 'common.created'
	})
	@RequireAuthorized(UserRole.ADMIN)
	async insertOne(
		@User() user: RequestUser,
		@Body(new ZodValidationPipe(createUserValidator)) createUserDTO: CreateUserDTO
	) {
		return await this.userService.insertOne({
			...createUserDTO,
			user_code_created: user?.username ?? 'sa',
			user_name_created: user?.display_name ?? 'sa'
		})
	}

	@RouteHandler({
		endpoint: 'update/:username',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: 'common.created'
	})
	@RequireAuthorized(UserRole.ADMIN)
	async updateOne(
		@User() currentUser: RequestUser,
		@Param('username') username: string,
		@Body(new ZodValidationPipe(updateUserValidator)) createUserDTO: UpdateUserDTO
	) {
		return await this.userService.updateOneByUsername(username, {
			...createUserDTO,
			user_code_updated: currentUser?.username ?? 'sa',
			user_name_updated: currentUser?.display_name ?? 'sa'
		})
	}

	@RouteHandler({ method: HttpMethod.GET })
	@RequireAuthorized(UserRole.ADMIN)
	async getUsers() {
		return await this.userService.findAll()
	}

	@RouteHandler({
		endpoint: 'update-status/:username',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.OK,
		message: 'common.ok'
	})
	@RequireAuthorized(UserRole.ADMIN)
	async updateUserStatus(
		@User() currentUser: RequestUser,
		@Param('username') username: string,
		@Body(new ZodValidationPipe(updateUserStatusValidator)) { is_active }: UpdateUserStatusDTO
	) {
		if (currentUser.username === username) {
			throw new ForbiddenException('You cannot change status your own account')
		}

		console.log('payload.is_active', is_active)

		return this.userService.updateUserActiveStatus(username, {
			is_active,
			user_code_updated: currentUser.username,
			user_name_updated: currentUser.display_name
		})
	}

	// #region Self-Service Profile Management
	@RouteHandler({ endpoint: 'profile', method: HttpMethod.GET })
	@RequireAuthenticated()
	async getProfile(@User('username') username) {
		return await this.userService.getProfile(username)
	}

	@RouteHandler({
		endpoint: 'profile',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: { i18nKey: 'common.updated' }
	})
	@RequireAuthenticated()
	async updateProfile(
		@User('username') username: string,
		@Body(new ZodValidationPipe(updateProfileValidator)) payload: UpdateProfileDTO
	) {
		return await this.userService.updateProfile(username, payload)
	}

	@RouteHandler({
		endpoint: 'change-password',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: { i18nKey: 'common.updated' }
	})
	@RequireAuthenticated()
	async changePassword(
		@User('username') username: string,
		@Body(new ZodValidationPipe(changePasswordValidator)) payload: ChangePasswordDTO
	) {
		return await this.userService.changePassword(username, payload)
	}

	/**
	 * @deprecated
	 * @param username
	 * @returns
	 */
	@RouteHandler({ endpoint: 'companies', method: HttpMethod.GET })
	@RequireAuthenticated()
	async getUserFactory(@User('username') username: string) {
		return await this.userService.getUserCompany(username)
	}
}
