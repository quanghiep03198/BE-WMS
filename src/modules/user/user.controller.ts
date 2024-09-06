import { UseBaseAPI } from '@/common/decorators/base-api.decorator'
import { User } from '@/common/decorators/user.decorator'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'
import { JwtGuard } from '@/modules/auth/guards/jwt.guard'
import { Body, Controller, Get, HttpStatus, Patch, Post, UseGuards, UsePipes } from '@nestjs/common'
import {
	ChangePasswordDTO,
	changePasswordValidator,
	RegisterDTO,
	registerValidator,
	UpdateProfileDTO,
	updateProfileValidator
} from './dto/user.dto'
import { UserService } from './user.service'

@Controller()
export class UserController {
	constructor(private readonly userService: UserService) {}

	@Post('register')
	@UsePipes(new ZodValidationPipe(registerValidator))
	@UseBaseAPI(HttpStatus.OK, { i18nKey: 'common.created' })
	async register(@Body() payload: RegisterDTO) {
		return await this.userService.createUser(payload)
	}

	@Get('profile')
	@UseGuards(JwtGuard)
	@UseBaseAPI(HttpStatus.OK, { i18nKey: 'common.ok' })
	async getProfile(@User('id') userId) {
		return await this.userService.getProfile(userId)
	}

	@Patch('profile/update')
	@UseGuards(JwtGuard)
	@UsePipes(new ZodValidationPipe(updateProfileValidator))
	@UseBaseAPI(HttpStatus.OK, { i18nKey: 'common.ok' })
	async updateProfile(@User('employee_code') employeeCode: string, @Body() payload: UpdateProfileDTO) {
		return await this.userService.updateProfile(employeeCode, payload)
	}

	@Patch('change-password')
	@UseGuards(JwtGuard)
	@UsePipes(new ZodValidationPipe(changePasswordValidator))
	@UseBaseAPI(HttpStatus.OK, { i18nKey: 'common.ok' })
	async changePassword(@User('id') userId: number, @Body() payload: ChangePasswordDTO) {
		return await this.userService.changePassword(userId, payload)
	}

	@Get('companies')
	@UseGuards(JwtGuard)
	@UseBaseAPI(HttpStatus.OK, { i18nKey: 'common.ok' })
	async getUserFactory(@User('id') id: number) {
		return await this.userService.getUserCompany(+id)
	}
}
