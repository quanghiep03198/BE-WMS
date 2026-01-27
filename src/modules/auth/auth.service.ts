import { ZodValidationPipe } from '@/common/pipes'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { BadRequestException, Inject, Injectable, NotFoundException, UsePipes } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Cache } from 'cache-manager'
import { pick } from 'lodash'
import { I18nContext, I18nService } from 'nestjs-i18n'

import { DATA_SOURCE_SYSCLOUD } from '@/databases/constants'
import { InjectRepository } from '@nestjs/typeorm'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { createHash, randomBytes } from 'node:crypto'
import { IsNull, Repository } from 'typeorm'
import { UserRole } from '../user/constants'
import { UserEntity } from '../user/entities/user.entity'
import { UserService } from '../user/services/user.service'
import { LoginDTO, loginValidator } from './dto/auth.dto'
import { RefreshTokenEntity } from './entities/refresh-token.entity'

@Injectable()
export class AuthService {
	private readonly TOKEN_CACHE_TTL = 60 * 1000 * 60 + 30 * 1000

	constructor(
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
		@InjectRepository(RefreshTokenEntity, DATA_SOURCE_SYSCLOUD)
		private readonly refreshTokenRepository: Repository<RefreshTokenEntity>,
		@InjectPinoLogger(AuthService.name) private readonly logger: PinoLogger,
		private readonly jwtService: JwtService,
		private readonly userService: UserService,
		private readonly i18nService: I18nService
	) {}

	@UsePipes(new ZodValidationPipe(loginValidator))
	async validateUser(payload: LoginDTO) {
		const user = await this.userService.findUserByUsername(payload.username)
		if (!user)
			throw new NotFoundException(this.i18nService.t('auth.user_not_found', { lang: I18nContext.current()?.lang }))
		if (!user.authenticate(payload.password))
			throw new BadRequestException(
				this.i18nService.t('auth.incorrect_password', { lang: I18nContext.current()?.lang })
			)
		return { ...user, is_admin: user.roles.includes(UserRole.ADMIN) }
	}

	async login(payload: UserEntity) {
		const username = payload.username
		const user = await this.userService.getProfile(username)
		const tokenPayload = pick(user, ['id', 'username', 'employee_code', 'display_name', 'roles'])

		const [accessToken, refreshToken] = await Promise.all([
			this.jwtService.signAsync(tokenPayload),
			this.signRefreshToken(username)
		])
		await this.cacheManager.set(`token:${username}`, accessToken, this.TOKEN_CACHE_TTL)
		return { user, accessToken, refreshToken }
	}

	async refreshToken(username: string, refreshToken: string) {
		const isValidRefreshToken = await this.verifyRefreshToken(username, refreshToken)
		if (!isValidRefreshToken) throw new BadRequestException('Invalid refresh token')
		const user = await this.userService.findUserByUsername(username)
		if (!user) throw new NotFoundException('User could not be found')
		// * Generate new access token
		const userPayload = pick(user, ['id', 'username', 'employee_code', 'display_name', 'roles'])
		const newAccessToken = await this.jwtService.signAsync(userPayload)
		// * Cache new access token
		await this.cacheManager.set(`token:${username}`, newAccessToken, this.TOKEN_CACHE_TTL)
		return newAccessToken
	}

	async logout(username: string) {
		// * Revoke cached token
		await Promise.all([
			this.cacheManager.del(`token:${username}`),
			this.refreshTokenRepository.update({ username, revoked_at: IsNull() }, { revoked_at: new Date() })
		])
		return null
	}

	async signRefreshToken(username: string): Promise<string> {
		const opaqueToken = randomBytes(32).toString('base64url')
		const newRefreshToken = this.refreshTokenRepository.create({
			username,
			token_hash: createHash('sha256').update(opaqueToken).digest('hex'),
			expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
		})
		await this.refreshTokenRepository.save(newRefreshToken)
		return opaqueToken
	}

	async verifyRefreshToken(username: string, opaqueToken: string): Promise<boolean> {
		this.logger.debug(`Verifying refresh token for user: ${username}, token: ${opaqueToken}`)
		const tokenHash = createHash('sha256').update(opaqueToken).digest('hex')
		const storedToken = await this.refreshTokenRepository.findOne({
			where: { username, token_hash: tokenHash, revoked_at: null }
		})
		if (!storedToken) return false
		if (storedToken.expires_at < new Date()) return false
		return true
	}
}
