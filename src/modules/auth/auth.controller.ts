import { HttpMethod, RequireAuthenticated, RouteHandler, User } from '@/common/decorators'
// import { Cookies } from '@/common/decorators/cookies.decorator'
import { CommonRequestHeader } from '@/common/constants'
import { Cookies } from '@/common/decorators/cookies.decorator'
import { Controller, Headers, Res, UseGuards } from '@nestjs/common'
import { FastifyReply } from 'fastify'
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
	async login(@User() user: any, @Res({ passthrough: true }) res: FastifyReply) {
		const data = await this.authService.login(user)
		res.setCookie('refresh-token', data.refreshToken, {
			maxAge: 30 * 24 * 60 * 60,
			httpOnly: true,
			sameSite: 'strict',
			path: '/',
			secure: 'auto'
		})
		res.setCookie('access-token', data.accessToken, {
			maxAge: 60,
			httpOnly: true,
			sameSite: 'strict',
			path: '/',
			secure: 'auto'
		})
		return data
	}

	@RouteHandler({
		endpoint: 'refresh-token',
		method: HttpMethod.GET
	})
	async refreshToken(
		@Cookies('refresh-token') refreshToken: string,
		@Headers(CommonRequestHeader.USER) username: string,
		@Res({ passthrough: true }) res: FastifyReply
	): Promise<string> {
		console.log('\n\n\nusername', username, '\n\n\n')
		const { newAccessToken, newRefreshToken } = await this.authService.refreshToken(username, refreshToken)

		res.setCookie('access-token', newAccessToken, {
			maxAge: 60 * 60,
			httpOnly: true,
			sameSite: 'strict',
			path: '/',
			secure: 'auto'
		})

		res.setCookie('refresh-token', newRefreshToken, {
			maxAge: 30 * 24 * 60 * 60,
			httpOnly: true,
			sameSite: 'strict',
			path: '/',
			secure: 'auto'
		})

		return newAccessToken
	}

	@RouteHandler({
		endpoint: 'logout',
		method: HttpMethod.POST
	})
	@RequireAuthenticated()
	async logout(@User('username') username: string, @Res({ passthrough: true }) res: FastifyReply) {
		res.clearCookie('access-token', { path: '/', httpOnly: true, sameSite: 'strict', secure: 'auto' })
		res.clearCookie('refresh-token', { path: '/', httpOnly: true, sameSite: 'strict', secure: 'auto' })

		return await this.authService.logout(username)
	}
}
