import { Api, AuthGuard, HttpMethod, User } from '@/common/decorators'
import { Controller, Param, UseGuards } from '@nestjs/common'
import { AuthService } from './auth.service'
import { LocalAuthGuard } from './guards/local-auth.guard'

@Controller()
export class AuthController {
	constructor(private readonly authService: AuthService) {}

	@Api({
		endpoint: 'login',
		method: HttpMethod.POST
	})
	@UseGuards(LocalAuthGuard)
	async login(@User() user) {
		return await this.authService.login(user)
	}

	@Api({
		endpoint: 'refresh-token/:username',
		method: HttpMethod.GET
	})
	async refreshToken(@Param('username') username: string) {
		return await this.authService.refreshToken(username)
	}

	@Api({
		endpoint: 'logout',
		method: HttpMethod.POST
	})
	@AuthGuard()
	async logout(@User('username') username: string) {
		return await this.authService.logout(username)
	}
}
