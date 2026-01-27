import { HttpMethod, RouteHandler, User } from '@/common/decorators'
import { Controller, Param, UseGuards } from '@nestjs/common'
import { AuthService } from './auth.service'
import { LocalAuthGuard } from './guards/local-auth.guard'

@Controller()
export class AuthController {
	constructor(private readonly authService: AuthService) {}

	@RouteHandler({
		endpoint: 'login',
		method: HttpMethod.POST
	})
	@UseGuards(LocalAuthGuard)
	async login(@User() user) {
		return await this.authService.login(user)
	}

	@RouteHandler({
		endpoint: 'refresh-token/:username',
		method: HttpMethod.GET
	})
	async refreshToken(@Param('username') username: string) {
		return await this.authService.refreshToken(username)
	}

	@RouteHandler({
		endpoint: 'logout',
		method: HttpMethod.POST
	})
	async logout(@User('username') username: string) {
		return await this.authService.logout(username)
	}
}
