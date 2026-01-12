import { Api, AuthGuard, HttpMethod, User } from '@/common/decorators'
import { ZodValidationPipe } from '@/common/pipes'
import { Body, Controller, HttpStatus } from '@nestjs/common'
import { ChangePasswordDTO, changePasswordValidator, UpdateProfileDTO, updateProfileValidator } from '../dto/user.dto'
import { UserService } from '../services/user.service'

@Controller()
export class UserController {
	constructor(private readonly userService: UserService) {}

	@Api({ endpoint: 'profile', method: HttpMethod.GET })
	@AuthGuard()
	async getProfile(@User('username') username) {
		return await this.userService.getProfile(username)
	}

	@Api({
		endpoint: 'profile/update',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: { i18nKey: 'common.updated' }
	})
	@AuthGuard()
	async updateProfile(
		@User('employee_code') employeeCode: string,
		@Body(new ZodValidationPipe(updateProfileValidator)) payload: UpdateProfileDTO
	) {
		return await this.userService.updateProfile(employeeCode, payload)
	}

	@Api({
		endpoint: 'change-password',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: { i18nKey: 'common.updated' }
	})
	@AuthGuard()
	async changePassword(
		@User('username') username: string,
		@Body(new ZodValidationPipe(changePasswordValidator)) payload: ChangePasswordDTO
	) {
		return await this.userService.changePassword(username, payload)
	}

	@Api({ endpoint: 'companies', method: HttpMethod.GET })
	@AuthGuard()
	async getUserFactory(@User('username') username: string) {
		return await this.userService.getUserCompany(username)
	}
}
