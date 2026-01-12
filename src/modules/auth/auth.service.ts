import { ZodValidationPipe } from '@/common/pipes'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { BadRequestException, Inject, Injectable, NotFoundException, UsePipes } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Cache } from 'cache-manager'
import { pick } from 'lodash'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { UserEntity } from '../user/entities/user.entity'
import { UserService } from '../user/services/user.service'
import { LoginDTO, loginValidator } from './dto/auth.dto'

@Injectable()
export class AuthService {
	private readonly TOKEN_CACHE_TTL = 60 * 1000 * 60 + 30 * 1000

	constructor(
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
		private readonly jwtService: JwtService,
		private readonly userService: UserService,
		private readonly i18n: I18nService
	) {}

	@UsePipes(new ZodValidationPipe(loginValidator))
	async validateUser(payload: LoginDTO) {
		const user = await this.userService.findUserByUsername(payload.username)
		if (!user) throw new NotFoundException(this.i18n.t('auth.user_not_found', { lang: I18nContext.current()?.lang }))
		if (!user.authenticate(payload.password))
			throw new BadRequestException(this.i18n.t('auth.incorrect_password', { lang: I18nContext.current()?.lang }))
		return user
	}

	async login(payload: UserEntity) {
		const username = payload.username
		const user = await this.userService.getProfile(username)
		const token = await this.jwtService.signAsync(pick(user, ['id', 'username', 'employee_code', 'role']))
		await this.cacheManager.set(`token:${username}`, token, this.TOKEN_CACHE_TTL)
		return { user, token }
	}

	async refreshToken(username: string) {
		const user = await this.userService.findUserByUsername(username)
		if (!user) throw new NotFoundException('User could not be found')
		const refreshToken = await this.jwtService.signAsync(pick(user, ['id', 'username', 'employee_code', 'role']))
		await this.cacheManager.set(`token:${username}`, refreshToken, this.TOKEN_CACHE_TTL)
		return refreshToken
	}

	async logout(username: string) {
		// * Revoke cached token
		await this.cacheManager.del(`token:${username}`)
		return null
	}
}
