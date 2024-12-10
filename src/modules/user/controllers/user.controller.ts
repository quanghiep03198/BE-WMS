import { Api, HttpMethod } from '@/common/decorators/api.decorator'
import { AuthGuard } from '@/common/decorators/auth.decorator'
import { User } from '@/common/decorators/user.decorator'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'
import { Body, Controller, HttpStatus } from '@nestjs/common'
import { ChangePasswordDTO, changePasswordValidator, UpdateProfileDTO, updateProfileValidator } from '../dto/user.dto'
import { UserService } from '../services/user.service'

@Controller()
export class UserController {
	constructor(private readonly userService: UserService) {}

	@Api({ endpoint: 'profile', method: HttpMethod.GET })
	@AuthGuard()
	async getProfile(@User('id') userId) {
		return await this.userService.getProfile(userId)
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
		@User('id') userId: number,
		@Body(new ZodValidationPipe(changePasswordValidator)) payload: ChangePasswordDTO
	) {
		return await this.userService.changePassword(userId, payload)
	}

	@Api({ endpoint: 'companies', method: HttpMethod.GET })
	@AuthGuard()
	async getUserFactory(@User('id') id: number) {
		return await this.userService.getUserCompany(+id)
	}
}
