import { HttpMethod, RequestUser, RequireAuthorized, RouteHandler, User } from '@/common/decorators'
import { ZodValidationPipe } from '@/common/pipes'
import { Body, Controller, ForbiddenException, HttpStatus, Param } from '@nestjs/common'
import { UserRole } from '../constants'
import {
	AuthorizeRoleDTO,
	authorizeRoleValidator,
	ChangePasswordDTO,
	changePasswordValidator,
	UpdateProfileDTO,
	updateProfileValidator
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

	@RouteHandler({ method: HttpMethod.GET })
	@RequireAuthorized(UserRole.ADMIN)
	async getUsers() {
		return await this.userService.findAll()
	}

	@RouteHandler({
		endpoint: 'authorize-role/:username',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: 'common.updated'
	})
	@RequireAuthorized(UserRole.ADMIN)
	async authorizeRoles(
		@Param('username') username: string,
		@Body(new ZodValidationPipe(authorizeRoleValidator)) authorizedRoles: AuthorizeRoleDTO
	) {
		return this.userService.authorizeRoles(username, authorizedRoles)
	}

	@RouteHandler({
		endpoint: 'deactivate/:username',
		method: HttpMethod.DELETE,
		statusCode: HttpStatus.OK,
		message: 'common.ok'
	})
	@RequireAuthorized(UserRole.ADMIN)
	async deactivateUser(@User('username') currentUserName: string, @Param('username') username: string) {
		if (currentUserName === username) {
			throw new ForbiddenException('You cannot deactivate your own account')
		}
		return this.userService.deactivateUser(username)
	}

	// #region Self-Service Profile Management
	@RouteHandler({ endpoint: 'profile', method: HttpMethod.GET })
	async getProfile(@User('username') username) {
		return await this.userService.getProfile(username)
	}

	@RouteHandler({
		endpoint: 'profile/update',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: { i18nKey: 'common.updated' }
	})
	async updateProfile(
		@User('employee_code') employeeCode: string,
		@Body(new ZodValidationPipe(updateProfileValidator)) payload: UpdateProfileDTO
	) {
		return await this.userService.updateProfile(employeeCode, payload)
	}

	@RouteHandler({
		endpoint: 'change-password',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: { i18nKey: 'common.updated' }
	})
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
	async getUserFactory(@User('username') username: string) {
		return await this.userService.getUserCompany(username)
	}
}
