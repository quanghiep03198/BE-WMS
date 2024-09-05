import { ApiHelper } from '@/common/decorators/api.decorator'
import { User } from '@/common/decorators/user.decorator'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'
import { JwtGuard } from '@/modules/auth/guards/jwt.guard'
import { Body, Controller, Get, HttpStatus, Post, UseGuards, UsePipes } from '@nestjs/common'
import { RegisterDTO, registerValidator } from './dto/user.dto'
import { UserService } from './user.service'

@Controller()
export class UserController {
	constructor(private readonly userService: UserService) {}

	@Post('register')
	@UsePipes(new ZodValidationPipe(registerValidator))
	@ApiHelper(HttpStatus.OK, { i18nKey: 'common.created' })
	async register(@Body() payload: RegisterDTO) {
		return await this.userService.createUser(payload)
	}

	@Get('profile')
	@UseGuards(JwtGuard)
	@ApiHelper(HttpStatus.OK, { i18nKey: 'common.ok' })
	async getProfile(@User('keyid') userId) {
		return await this.userService.getProfile(userId)
	}

	@Get('companies')
	@UseGuards(JwtGuard)
	@ApiHelper(HttpStatus.OK, { i18nKey: 'common.ok' })
	async getUserFactory(@User('keyid') id: number) {
		return await this.userService.getUserCompany(+id)
	}
}
