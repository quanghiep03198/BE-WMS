import { ApiHelper } from '@/common/decorators/api.decorator'
import { User } from '@/common/decorators/user.decorator'
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe'
import { Controller, Get, HttpStatus, Param, Post, UseGuards, UsePipes } from '@nestjs/common'
import { AuthService } from './auth.service'
import { loginValidator } from './dto/auth.dto'
import { JwtGuard } from './guards/jwt.guard'
import { LocalAuthGuard } from './guards/local-auth.guard'

@Controller()
export class AuthController {
	constructor(private authService: AuthService) {}

	@Post('login')
	@UseGuards(LocalAuthGuard)
	@UsePipes(new ZodValidationPipe(loginValidator))
	@ApiHelper(HttpStatus.OK, { i18nKey: 'common.ok' })
	async login(@User() user) {
		return await this.authService.login(user)
	}

	@Get('refresh-token/:id')
	@ApiHelper(HttpStatus.OK, { i18nKey: 'common.ok' })
	async refreshToken(@Param('id') id: number) {
		return await this.authService.refreshToken(id)
	}

	@Post('logout')
	@UseGuards(JwtGuard)
	@ApiHelper(HttpStatus.OK, { i18nKey: 'common.ok' })
	async logout(@User('keyid') userId) {
		return await this.authService.logout(userId)
	}
}
