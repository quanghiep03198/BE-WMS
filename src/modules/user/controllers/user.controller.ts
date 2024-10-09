import { AuthGuard } from '@/common/decorators/auth.decorator'
import { Api, HttpMethod } from '@/common/decorators/base-api.decorator'
import { User } from '@/common/decorators/user.decorator'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'
import { Body, Controller, HttpStatus, UsePipes } from '@nestjs/common'
import {
	ChangePasswordDTO,
	changePasswordValidator,
	RegisterDTO,
	registerValidator,
	UpdateProfileDTO,
	updateProfileValidator
} from '../dto/user.dto'
import { UserService } from '../services/user.service'

@Controller()
export class UserController {
	constructor(private readonly userService: UserService) {}

	@Api({
		endpoint: 'register',
		method: HttpMethod.POST,
		statusCode: HttpStatus.CREATED,
		message: { i18nKey: 'common.created' }
	})
	@UsePipes(new ZodValidationPipe(registerValidator))
	async register(@Body() payload: RegisterDTO) {
		return await this.userService.createUser(payload)
	}

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
	@UsePipes(new ZodValidationPipe(updateProfileValidator))
	async updateProfile(@User('employee_code') employeeCode: string, @Body() payload: UpdateProfileDTO) {
		return await this.userService.updateProfile(employeeCode, payload)
	}

	@Api({
		endpoint: 'change-password',
		method: HttpMethod.PATCH,
		statusCode: HttpStatus.CREATED,
		message: { i18nKey: 'common.updated' }
	})
	@AuthGuard()
	@UsePipes(new ZodValidationPipe(changePasswordValidator))
	async changePassword(@User('id') userId: number, @Body() payload: ChangePasswordDTO) {
		return await this.userService.changePassword(userId, payload)
	}

	@Api({ endpoint: 'companies', method: HttpMethod.GET })
	@AuthGuard()
	async getUserFactory(@User('id') id: number) {
		return await this.userService.getUserCompany(+id)
	}
}
