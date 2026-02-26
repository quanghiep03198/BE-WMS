import { CommonRequestHeader } from '@/common/constants'
import { Cookies, HttpMethod, RequestUser, RequireAuthenticated, RouteHandler, User } from '@/common/decorators'
import { CookieSerializeOptions } from '@fastify/cookie'
import { Controller, Headers, Res, UseGuards } from '@nestjs/common'
import { FastifyReply } from 'fastify'
import { AuthService } from './auth.service'
import {
	ACCESS_TOKEN_COOKIE_EXPIRATION,
	ACCESS_TOKEN_COOKIE_NAME,
	REFRESH_TOKEN_COOKIE_EXPIRATION,
	REFRESH_TOKEN_COOKIE_NAME
} from './constants'
import { LocalAuthGuard } from './guards/local-auth.guard'

@Controller()
export class AuthController {
	private readonly defaultCookieOptions: CookieSerializeOptions = {
		httpOnly: true,
		sameSite: 'lax',
		path: '/',
		secure: 'auto'
	}

	constructor(private readonly authService: AuthService) {}

	@RouteHandler({
		endpoint: 'login',
		method: HttpMethod.POST
	})
	@UseGuards(LocalAuthGuard)
	async login(@User() user: RequestUser, @Res({ passthrough: true }) res: FastifyReply) {
		const data = await this.authService.login(user)
		res.setCookie(ACCESS_TOKEN_COOKIE_NAME, data.accessToken, {
			maxAge: ACCESS_TOKEN_COOKIE_EXPIRATION,
			...this.defaultCookieOptions
		})
		res.setCookie(REFRESH_TOKEN_COOKIE_NAME, data.refreshToken, {
			maxAge: REFRESH_TOKEN_COOKIE_EXPIRATION,
			...this.defaultCookieOptions
		})
		return data
	}

	@RouteHandler({
		endpoint: 'refresh-token',
		method: HttpMethod.GET
	})
	async refreshToken(
		@Cookies(REFRESH_TOKEN_COOKIE_NAME) refreshToken: string,
		@Headers(CommonRequestHeader.USER_REQUEST) username: string,
		@Res({ passthrough: true }) res: FastifyReply
	) {
		try {
			const { newAccessToken, newRefreshToken } = await this.authService.refreshToken(username, refreshToken)
			res.setCookie(ACCESS_TOKEN_COOKIE_NAME, newAccessToken, {
				maxAge: ACCESS_TOKEN_COOKIE_EXPIRATION,
				...this.defaultCookieOptions
			})
			res.setCookie(REFRESH_TOKEN_COOKIE_NAME, newRefreshToken, {
				maxAge: REFRESH_TOKEN_COOKIE_EXPIRATION,
				...this.defaultCookieOptions
			})
			return { newAccessToken, newRefreshToken }
		} catch (error) {
			res.clearCookie(ACCESS_TOKEN_COOKIE_NAME, this.defaultCookieOptions)
			res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, this.defaultCookieOptions)
			throw error
		}
	}

	@RouteHandler({
		endpoint: 'logout',
		method: HttpMethod.POST
	})
	@RequireAuthenticated()
	async logout(@User('username') username: string, @Res({ passthrough: true }) res: FastifyReply) {
		res.clearCookie(ACCESS_TOKEN_COOKIE_NAME, this.defaultCookieOptions)
		res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, this.defaultCookieOptions)
		return await this.authService.logout(username)
	}
}
