import { HttpMethod, RequireAuthenticated, RouteHandler, User } from '@/common/decorators'
// import { Cookies } from '@/common/decorators/cookies.decorator'
import { Controller, Headers, Param, UseGuards } from '@nestjs/common'
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
	async login(@User() user: any) {
		const data = await this.authService.login(user)
		// response.setCookie('refresh-token', data.refreshToken, {
		// 	maxAge: 30 * 24 * 60 * 60 * 1000,
		// 	httpOnly: true,
		// 	sameSite: 'strict',
		// 	path: '/'
		// })
		return data
	}

	@RouteHandler({
		endpoint: 'refresh-token/:username',
		method: HttpMethod.GET
	})
	async refreshToken(@Headers('X-Refresh-Token') refreshToken: string, @Param('username') username: string) {
		console.log('\n\nrefreshToken', refreshToken, '\n\n')

		return await this.authService.refreshToken(username, refreshToken)
	}

	@RouteHandler({
		endpoint: 'logout',
		method: HttpMethod.POST
	})
	@RequireAuthenticated()
	async logout(@User('username') username: string) {
		return await this.authService.logout(username)
	}
}
